from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt
import stripe
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Mongo
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Auth config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = os.environ.get('JWT_ALGO', 'HS256')
JWT_EXPIRES_MINUTES = int(os.environ.get('JWT_EXPIRES_MINUTES', '43200'))
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
APP_BASE_URL = os.environ.get('APP_BASE_URL', '')
stripe.api_key = STRIPE_API_KEY
stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY) if STRIPE_API_KEY else None

app = FastAPI(title="Change Yourself API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()


def now_utc():
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(minutes=JWT_EXPIRES_MINUTES),
        "iat": now_utc(),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = pyjwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ------------ Models ------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    age: Optional[int] = None
    gender: Optional[Literal['male', 'female']] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    activity: Optional[Literal['sedentary', 'light', 'moderate', 'active', 'very_active']] = None
    goal: Optional[Literal['fat_loss', 'muscle_gain', 'healthy']] = None
    body_focus: Optional[List[str]] = None
    difficulty: Optional[Literal['easy', 'medium', 'hard', 'crazy']] = None
    target_reason: Optional[str] = None
    language: Optional[Literal['en', 'ar']] = None
    whistle_enabled: Optional[bool] = None

class WeightLog(BaseModel):
    weight_kg: float

class CompleteDayRequest(BaseModel):
    day: int

class RateWorkoutRequest(BaseModel):
    day: int
    rating: int = Field(..., ge=1, le=5)
    self_score: Optional[int] = Field(None, ge=1, le=5)
    note: Optional[str] = None

class ChatRequest(BaseModel):
    message: str


# ------------ Calorie calc ------------
ACTIVITY_FACTORS = {
    'sedentary': 1.2,
    'light': 1.375,
    'moderate': 1.55,
    'active': 1.725,
    'very_active': 1.9,
}

def compute_bmr_tdee(profile: dict):
    age = profile.get('age')
    gender = profile.get('gender')
    height = profile.get('height_cm')
    weight = profile.get('weight_kg')
    activity = profile.get('activity', 'moderate')
    goal = profile.get('goal', 'healthy')
    if not all([age, gender, height, weight]):
        return None
    if gender == 'male':
        bmr = 10 * weight + 6.25 * height - 5 * age + 5
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    tdee = bmr * ACTIVITY_FACTORS.get(activity, 1.55)
    if goal == 'fat_loss':
        target = tdee - 500
    elif goal == 'muscle_gain':
        target = tdee + 300
    else:
        target = tdee
    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "target_calories": round(target),
        "protein_g": round(weight * 2.0),
        "carbs_g": round(target * 0.45 / 4),
        "fats_g": round(target * 0.25 / 9),
    }


# ------------ Static content: exercises & meals ------------
EXERCISES_BY_FOCUS = {
    "belly": [
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        {"name": "Mountain Climbers", "sets": 3, "reps": 20, "unit": "reps", "icon": "flash-outline", "gif": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400"},
        {"name": "Russian Twists", "sets": 3, "reps": 30, "unit": "reps", "icon": "sync-outline", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Bicycle Crunches", "sets": 3, "reps": 20, "unit": "reps", "icon": "bicycle-outline", "gif": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400"},
        {"name": "Leg Raises", "sets": 3, "reps": 15, "unit": "reps", "icon": "arrow-up-outline", "gif": "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=400"},
    ],
    "chest": [
        {"name": "Push Ups", "sets": 4, "reps": 15, "unit": "reps", "icon": "fitness-outline", "gif": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
        {"name": "Incline Push Ups", "sets": 3, "reps": 12, "unit": "reps", "icon": "trending-up-outline", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Diamond Push Ups", "sets": 3, "reps": 10, "unit": "reps", "icon": "diamond-outline", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Chest Dips", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-down-outline", "gif": "https://images.unsplash.com/photo-1583500178690-f7fd39f44e8d?w=400"},
    ],
    "arms": [
        {"name": "Bicep Curls", "sets": 4, "reps": 12, "unit": "reps", "icon": "barbell-outline", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Tricep Dips", "sets": 3, "reps": 15, "unit": "reps", "icon": "arrow-down-outline", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Hammer Curls", "sets": 3, "reps": 12, "unit": "reps", "icon": "barbell-outline", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
        {"name": "Pike Push Ups", "sets": 3, "reps": 10, "unit": "reps", "icon": "fitness-outline", "gif": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
    ],
    "legs": [
        {"name": "Squats", "sets": 4, "reps": 20, "unit": "reps", "icon": "body-outline", "gif": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
        {"name": "Lunges", "sets": 3, "reps": 12, "unit": "each", "icon": "walk-outline", "gif": "https://images.unsplash.com/photo-1434596922112-19c563067271?w=400"},
        {"name": "Jump Squats", "sets": 3, "reps": 15, "unit": "reps", "icon": "flash-outline", "gif": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400"},
        {"name": "Wall Sit", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=400"},
        {"name": "Calf Raises", "sets": 3, "reps": 20, "unit": "reps", "icon": "arrow-up-outline", "gif": "https://images.unsplash.com/photo-1535743686920-55e4145369b9?w=400"},
    ],
    "waist": [
        {"name": "Side Plank", "sets": 3, "reps": 30, "unit": "sec each", "icon": "timer-outline", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        {"name": "Standing Side Crunches", "sets": 3, "reps": 20, "unit": "reps", "icon": "swap-horizontal-outline", "gif": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400"},
        {"name": "Wood Choppers", "sets": 3, "reps": 12, "unit": "each", "icon": "leaf-outline", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
        {"name": "Russian Twists", "sets": 3, "reps": 30, "unit": "reps", "icon": "sync-outline", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
    ],
    "full_body": [
        {"name": "Burpees", "sets": 3, "reps": 12, "unit": "reps", "icon": "flame-outline", "gif": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400"},
        {"name": "Jumping Jacks", "sets": 3, "reps": 30, "unit": "reps", "icon": "expand-outline", "gif": "https://images.unsplash.com/photo-1434596922112-19c563067271?w=400"},
        {"name": "Push Ups", "sets": 3, "reps": 15, "unit": "reps", "icon": "fitness-outline", "gif": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
        {"name": "Squats", "sets": 3, "reps": 20, "unit": "reps", "icon": "body-outline", "gif": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        {"name": "Mountain Climbers", "sets": 3, "reps": 20, "unit": "reps", "icon": "flash-outline", "gif": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400"},
    ],
}

DIFFICULTY_MULT = {"easy": 0.7, "medium": 1.0, "hard": 1.3, "crazy": 1.6}

def scale_exercises(exercises, difficulty):
    mult = DIFFICULTY_MULT.get(difficulty, 1.0)
    out = []
    for e in exercises:
        scaled = dict(e)
        scaled["sets"] = max(2, round(e["sets"] * (0.85 + mult * 0.15)))
        scaled["reps"] = max(5, round(e["reps"] * mult))
        out.append(scaled)
    return out

MEAL_PLANS = {
    "fat_loss": {
        "title": "Fat Loss Plan",
        "calories": "1500-1800 kcal",
        "image": "https://images.unsplash.com/photo-1609915437515-9d0f0166b537?w=800",
        "meals": [
            {"meal": "Breakfast", "name": "Greek Yogurt + Berries + Oats", "kcal": 320, "protein": 22},
            {"meal": "Snack", "name": "Apple + Almonds (15g)", "kcal": 180, "protein": 5},
            {"meal": "Lunch", "name": "Grilled Chicken Salad + Olive Oil", "kcal": 450, "protein": 38},
            {"meal": "Snack", "name": "Boiled Eggs (2) + Cucumber", "kcal": 160, "protein": 14},
            {"meal": "Dinner", "name": "Baked Salmon + Steamed Broccoli", "kcal": 480, "protein": 40},
        ],
    },
    "muscle_gain": {
        "title": "Muscle Gain Plan",
        "calories": "2500-2800 kcal",
        "image": "https://images.unsplash.com/photo-1666819691716-827f78d892f3?w=800",
        "meals": [
            {"meal": "Breakfast", "name": "4 Egg Omelet + Oats + Banana", "kcal": 620, "protein": 38},
            {"meal": "Snack", "name": "Whey Protein Shake + Peanut Butter", "kcal": 380, "protein": 32},
            {"meal": "Lunch", "name": "Chicken Breast + Rice + Veggies", "kcal": 720, "protein": 55},
            {"meal": "Snack", "name": "Greek Yogurt + Honey + Granola", "kcal": 320, "protein": 22},
            {"meal": "Dinner", "name": "Lean Beef + Sweet Potato + Spinach", "kcal": 680, "protein": 50},
        ],
    },
    "healthy": {
        "title": "Healthy Lifestyle",
        "calories": "1900-2200 kcal",
        "image": "https://images.unsplash.com/photo-1609915437515-9d0f0166b537?w=800",
        "meals": [
            {"meal": "Breakfast", "name": "Avocado Toast + Eggs", "kcal": 420, "protein": 22},
            {"meal": "Snack", "name": "Mixed Nuts + Fruit", "kcal": 220, "protein": 7},
            {"meal": "Lunch", "name": "Quinoa Bowl + Chickpeas + Veggies", "kcal": 520, "protein": 24},
            {"meal": "Snack", "name": "Cottage Cheese + Berries", "kcal": 200, "protein": 18},
            {"meal": "Dinner", "name": "Grilled Fish + Brown Rice + Salad", "kcal": 540, "protein": 38},
        ],
    },
}


# ------------ Routes ------------
@api_router.get("/")
async def root():
    return {"message": "Change Yourself API"}


@api_router.post("/auth/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": req.email.lower(),
        "name": req.name,
        "password": hash_password(req.password),
        "created_at": now_utc().isoformat(),
        "profile": {},
        "challenge_start": None,
        "streak": 0,
        "completed_days": [],
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    user_safe = {k: v for k, v in user_doc.items() if k not in ("password", "_id")}
    return {"token": token, "user": user_safe}


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    user.pop("password", None)
    user.pop("_id", None)
    return {"token": token, "user": user}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api_router.put("/profile")
async def update_profile(req: ProfileUpdate, user=Depends(get_current_user)):
    update = {f"profile.{k}": v for k, v in req.dict(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    # If challenge not started yet, start it on first profile completion
    set_doc = dict(update)
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    merged_profile = {**(user_full.get("profile") or {}), **req.dict(exclude_none=True)}
    has_core = all(merged_profile.get(k) for k in ("age", "gender", "height_cm", "weight_kg", "goal"))
    if not user_full.get("challenge_start") and has_core:
        set_doc["challenge_start"] = now_utc().isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": set_doc})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    macros = compute_bmr_tdee(fresh.get("profile", {}))
    return {"user": fresh, "macros": macros}


@api_router.get("/calories")
async def calories(user=Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    macros = compute_bmr_tdee(profile)
    if not macros:
        raise HTTPException(status_code=400, detail="Complete your profile first")
    # BMI
    h = profile.get("height_cm")
    w = profile.get("weight_kg")
    if h and w:
        bmi = round(w / ((h / 100) ** 2), 1)
        if bmi < 18.5:
            cat = "under"
        elif bmi < 25:
            cat = "normal"
        elif bmi < 30:
            cat = "over"
        else:
            cat = "obese"
        macros["bmi"] = bmi
        macros["bmi_category"] = cat
    return macros


@api_router.get("/workouts/today")
async def workout_today(user=Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    focus_list = profile.get("body_focus") or ["full_body"]
    focus = focus_list[0] if focus_list else "full_body"
    difficulty = profile.get("difficulty", "medium")
    exercises = scale_exercises(EXERCISES_BY_FOCUS.get(focus, EXERCISES_BY_FOCUS["full_body"]), difficulty)
    # Ongoing day counter (no cap)
    start = user.get("challenge_start")
    day = 1
    if start:
        try:
            start_dt = datetime.fromisoformat(start)
            delta = (now_utc() - start_dt).days
            day = max(delta + 1, 1)
        except Exception:
            pass
    return {
        "day": day,
        "focus": focus,
        "difficulty": difficulty,
        "title": f"Day {day} • {focus.replace('_', ' ').title()}",
        "exercises": exercises,
        "estimated_minutes": int(20 + len(exercises) * 2 * DIFFICULTY_MULT.get(difficulty, 1.0)),
        "completed_days": user.get("completed_days", []),
        "streak": user.get("streak", 0),
    }


@api_router.post("/workouts/rate")
async def rate_workout(req: RateWorkoutRequest, user=Depends(get_current_user)):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "day": req.day,
        "rating": req.rating,
        "self_score": req.self_score,
        "note": req.note,
        "logged_at": now_utc().isoformat(),
    }
    await db.workout_ratings.insert_one(entry)
    entry.pop("_id", None)
    return entry


@api_router.get("/progress/weekly")
async def weekly_progress(user=Depends(get_current_user)):
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("logged_at", 1).limit(1000).to_list(None)
    if not logs:
        return {"weeks": []}
    start = datetime.fromisoformat(logs[0]["logged_at"])
    buckets: dict = {}
    for l in logs:
        dt = datetime.fromisoformat(l["logged_at"])
        wk = (dt - start).days // 7
        buckets.setdefault(wk, []).append(l["weight_kg"])
    weeks = []
    prev_weight = None
    first_weight = logs[0]["weight_kg"]
    for wk in sorted(buckets.keys()):
        avg = round(sum(buckets[wk]) / len(buckets[wk]), 1)
        delta = round(avg - prev_weight, 1) if prev_weight is not None else 0.0
        total_lost = round(first_weight - avg, 1)
        # rough fat-loss estimate (75% of weight lost is fat in caloric deficit)
        fat_loss = round(max(0.0, total_lost) * 0.75, 1)
        weeks.append({
            "week": wk + 1,
            "avg_weight": avg,
            "delta": delta,
            "total_lost": total_lost,
            "fat_loss_est": fat_loss,
        })
        prev_weight = avg
    return {"weeks": weeks}


@api_router.post("/workouts/complete")
async def complete_workout(req: CompleteDayRequest, user=Depends(get_current_user)):
    completed = user.get("completed_days", []) or []
    if req.day in completed:
        return {"streak": user.get("streak", 0), "completed_days": completed, "already": True}
    completed.append(req.day)
    streak = (user.get("streak", 0) or 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"completed_days": completed, "streak": streak}}
    )
    return {"streak": streak, "completed_days": completed, "already": False}


@api_router.get("/meals/plans")
async def meal_plans(user=Depends(get_current_user)):
    goal = (user.get("profile") or {}).get("goal", "healthy")
    return {"recommended": goal, "plans": MEAL_PLANS}


@api_router.post("/progress/weight")
async def log_weight(req: WeightLog, user=Depends(get_current_user)):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "weight_kg": req.weight_kg,
        "logged_at": now_utc().isoformat(),
    }
    await db.weight_logs.insert_one(entry)
    await db.users.update_one({"id": user["id"]}, {"$set": {"profile.weight_kg": req.weight_kg}})
    entry.pop("_id", None)
    return entry


@api_router.get("/progress/weight")
async def get_weights(user=Depends(get_current_user)):
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("logged_at", 1).limit(500).to_list(None)
    return {"logs": logs}


@api_router.post("/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    profile = user.get("profile", {}) or {}
    macros = compute_bmr_tdee(profile) or {}
    sys = (
        "You are 'Coach C', an energetic, motivating, expert personal trainer and nutritionist for the Change Yourself 30-Day Challenge app. "
        "Reply in short, punchy paragraphs (max 120 words). Use bold motivating language but stay accurate and safe. "
        f"User: {user.get('name')}. Profile: age={profile.get('age')}, gender={profile.get('gender')}, "
        f"height={profile.get('height_cm')}cm, weight={profile.get('weight_kg')}kg, "
        f"goal={profile.get('goal')}, activity={profile.get('activity')}, focus={profile.get('body_focus')}. "
        f"Target calories: {macros.get('target_calories')} kcal/day, protein {macros.get('protein_g')}g."
    )
    session_id = f"coach-{user['id']}"
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=sys,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        reply = await chat_client.send_message(UserMessage(text=req.message))
    except Exception:
        logging.exception("LLM error")
        raise HTTPException(status_code=500, detail="AI coach is temporarily unavailable. Please try again.")

    ts = now_utc().isoformat()
    await db.chat_history.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "user", "text": req.message, "ts": ts},
        {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "assistant", "text": reply, "ts": ts},
    ])
    return {"reply": reply}


@api_router.get("/chat/history")
async def chat_history(user=Depends(get_current_user)):
    msgs = await db.chat_history.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", 1).limit(200).to_list(None)
    return {"messages": msgs}


# ============ STRIPE SUBSCRIPTIONS (one-time access passes via emergentintegrations) ============
# User pays once for N days of access. After expiry → paywall + resubscribe prompt.
PLAN_CONFIG = {
    "monthly":   {"amount": 3.99,  "days": 30,  "label": "Monthly",  "display": "£3.99"},
    "sixmonths": {"amount": 19.99, "days": 180, "label": "6 Months", "display": "£19.99"},
    "yearly":    {"amount": 34.99, "days": 365, "label": "Yearly",   "display": "£34.99"},
}


class CheckoutRequest(BaseModel):
    plan: Literal['monthly', 'sixmonths', 'yearly']
    origin_url: Optional[str] = None


def is_subscription_active(user: dict) -> bool:
    sub = user.get("subscription") if user else None
    if not sub:
        return False
    expires = sub.get("access_expires_at")
    if not expires:
        return False
    try:
        return datetime.fromisoformat(expires) > now_utc()
    except Exception:
        return False


@api_router.get("/subscription/plans")
async def subscription_plans():
    return {
        "currency": "GBP",
        "plans": [
            {"key": "monthly",   "label": "Monthly",   "amount": 3.99,  "display": "£3.99",  "period": "30 days",   "savings": None},
            {"key": "sixmonths", "label": "6 Months",  "amount": 19.99, "display": "£19.99", "period": "180 days",  "savings": "16% off"},
            {"key": "yearly",    "label": "Yearly",    "amount": 34.99, "display": "£34.99", "period": "365 days",  "savings": "27% off"},
        ],
    }


@api_router.get("/subscription/status")
async def subscription_status(user=Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    sub = (fresh or {}).get("subscription") or {}
    active = is_subscription_active(fresh)
    return {
        "active": active,
        "plan": sub.get("plan"),
        "amount": sub.get("amount"),
        "purchased_at": sub.get("purchased_at"),
        "access_expires_at": sub.get("access_expires_at"),
        "last_payment_status": sub.get("last_payment_status"),
    }


@api_router.post("/subscription/checkout")
async def subscription_checkout(req: CheckoutRequest, user=Depends(get_current_user)):
    if not stripe_checkout:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    cfg = PLAN_CONFIG[req.plan]
    origin = (req.origin_url or APP_BASE_URL).rstrip('/')
    success_url = f"{origin}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/subscription/cancelled"
    payment_req = CheckoutSessionRequest(
        amount=cfg["amount"],
        currency="gbp",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["id"], "plan": req.plan, "days": str(cfg["days"]), "email": user["email"]},
    )
    session = await stripe_checkout.create_checkout_session(payment_req)
    # Record pending payment
    await db.payments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "session_id": session.session_id,
        "plan": req.plan,
        "amount": cfg["amount"],
        "currency": "gbp",
        "payment_status": "pending",
        "created_at": now_utc().isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id, "plan": req.plan, "display": cfg["display"]}


@api_router.get("/subscription/poll/{session_id}")
async def subscription_poll(session_id: str, user=Depends(get_current_user)):
    """Frontend polls this after redirecting back from Stripe.
    On first 'paid' status, grants user N days of access."""
    if not stripe_checkout:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    # NOTE: emergentintegrations.get_checkout_status crashes on Pydantic v2 because Stripe's
    # SDK returns metadata as a StripeObject (not a plain dict). We bypass that wrapper
    # and call stripe directly — stripe.api_base is already pointed at the emergent proxy
    # by StripeCheckout.__init__.
    # Also: emergent proxy occasionally 404s right after creating a session (race). Retry.
    session = None
    last_err: Optional[Exception] = None
    for attempt in range(4):
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            break
        except stripe.error.StripeError as e:
            last_err = e
            await asyncio.sleep(0.6 * (attempt + 1))
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {last_err}")

    class _S:  # tiny shim so existing access pattern stays identical
        status = session.status
        payment_status = session.payment_status
        amount_total = session.amount_total
    status_res = _S()
    payment_doc = await db.payments.find_one({"session_id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not payment_doc:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Update payment record
    await db.payments.update_one(
        {"session_id": session_id},
        {"$set": {
            "stripe_status": status_res.status,
            "payment_status": status_res.payment_status,
            "amount_total": status_res.amount_total,
            "updated_at": now_utc().isoformat(),
        }}
    )

    granted = False
    if status_res.payment_status == "paid" and payment_doc.get("payment_status") != "paid":
        # Idempotent grant: mark payment paid + extend access
        plan = payment_doc["plan"]
        days = PLAN_CONFIG[plan]["days"]
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        existing_expires = (fresh.get("subscription") or {}).get("access_expires_at")
        base = now_utc()
        if existing_expires:
            try:
                exp_dt = datetime.fromisoformat(existing_expires)
                if exp_dt > base:
                    base = exp_dt  # extend on top of remaining time
            except Exception:
                pass
        new_expires = base + timedelta(days=days)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "subscription": {
                    "plan": plan,
                    "amount": payment_doc["amount"],
                    "purchased_at": now_utc().isoformat(),
                    "access_expires_at": new_expires.isoformat(),
                    "last_payment_status": "paid",
                    "session_id": session_id,
                }
            }}
        )
        await db.payments.update_one({"session_id": session_id}, {"$set": {"payment_status": "paid"}})
        granted = True

    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "payment_status": status_res.payment_status,
        "checkout_status": status_res.status,
        "granted": granted,
        "active": is_subscription_active(fresh),
        "access_expires_at": (fresh.get("subscription") or {}).get("access_expires_at"),
    }


# ============ END STRIPE ============


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
