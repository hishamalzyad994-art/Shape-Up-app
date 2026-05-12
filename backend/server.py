from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt
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
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://media.tenor.com/0zG9_v01rXEAAAAi/plank-exercise.gif"},
        {"name": "Mountain Climbers", "sets": 3, "reps": 20, "unit": "reps", "icon": "flash-outline", "gif": "https://media.tenor.com/X-7zT3PUiPYAAAAi/mountain-climbers.gif"},
        {"name": "Russian Twists", "sets": 3, "reps": 30, "unit": "reps", "icon": "sync-outline", "gif": "https://media.tenor.com/I8_axDdrntoAAAAi/russian-twist.gif"},
        {"name": "Bicycle Crunches", "sets": 3, "reps": 20, "unit": "reps", "icon": "bicycle-outline", "gif": "https://media.tenor.com/dRtkB6JpEoAAAAAi/bicycle-crunch.gif"},
        {"name": "Leg Raises", "sets": 3, "reps": 15, "unit": "reps", "icon": "arrow-up-outline", "gif": "https://media.tenor.com/T_HXqVF7tcsAAAAi/leg-raise.gif"},
    ],
    "chest": [
        {"name": "Push Ups", "sets": 4, "reps": 15, "unit": "reps", "icon": "fitness-outline", "gif": "https://media.tenor.com/UMl7iEdvSh4AAAAi/push-ups.gif"},
        {"name": "Incline Push Ups", "sets": 3, "reps": 12, "unit": "reps", "icon": "trending-up-outline", "gif": "https://media.tenor.com/2lk1KhpUH9oAAAAi/incline-push-up.gif"},
        {"name": "Diamond Push Ups", "sets": 3, "reps": 10, "unit": "reps", "icon": "diamond-outline", "gif": "https://media.tenor.com/Rqp0FAHvxxIAAAAi/diamond-push-up.gif"},
        {"name": "Chest Dips", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-down-outline", "gif": "https://media.tenor.com/G4cKbS3xEbgAAAAi/chest-dip.gif"},
    ],
    "arms": [
        {"name": "Bicep Curls", "sets": 4, "reps": 12, "unit": "reps", "icon": "barbell-outline", "gif": "https://media.tenor.com/8u-eLY9Z1lwAAAAi/bicep-curl.gif"},
        {"name": "Tricep Dips", "sets": 3, "reps": 15, "unit": "reps", "icon": "arrow-down-outline", "gif": "https://media.tenor.com/4dSnsZbPbtMAAAAi/tricep-dip.gif"},
        {"name": "Hammer Curls", "sets": 3, "reps": 12, "unit": "reps", "icon": "barbell-outline", "gif": "https://media.tenor.com/QbW1POuFKL4AAAAi/hammer-curl.gif"},
        {"name": "Pike Push Ups", "sets": 3, "reps": 10, "unit": "reps", "icon": "fitness-outline", "gif": "https://media.tenor.com/dvhnQH40hcgAAAAi/pike-push-up.gif"},
    ],
    "legs": [
        {"name": "Squats", "sets": 4, "reps": 20, "unit": "reps", "icon": "body-outline", "gif": "https://media.tenor.com/zUDxV5LpkxsAAAAi/squat.gif"},
        {"name": "Lunges", "sets": 3, "reps": 12, "unit": "each", "icon": "walk-outline", "gif": "https://media.tenor.com/cYsxOQk-_jcAAAAi/lunge.gif"},
        {"name": "Jump Squats", "sets": 3, "reps": 15, "unit": "reps", "icon": "flash-outline", "gif": "https://media.tenor.com/4qB9OvtKlhEAAAAi/jump-squat.gif"},
        {"name": "Wall Sit", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://media.tenor.com/wfPJ4MaDDB8AAAAi/wall-sit.gif"},
        {"name": "Calf Raises", "sets": 3, "reps": 20, "unit": "reps", "icon": "arrow-up-outline", "gif": "https://media.tenor.com/ND8HqIhX2WAAAAAi/calf-raise.gif"},
    ],
    "waist": [
        {"name": "Side Plank", "sets": 3, "reps": 30, "unit": "sec each", "icon": "timer-outline", "gif": "https://media.tenor.com/JqVPaP_dHO0AAAAi/side-plank.gif"},
        {"name": "Standing Side Crunches", "sets": 3, "reps": 20, "unit": "reps", "icon": "swap-horizontal-outline", "gif": "https://media.tenor.com/HzpDLNJWB4MAAAAi/side-crunch.gif"},
        {"name": "Wood Choppers", "sets": 3, "reps": 12, "unit": "each", "icon": "leaf-outline", "gif": "https://media.tenor.com/3uoCpC0nJWMAAAAi/wood-chopper.gif"},
        {"name": "Russian Twists", "sets": 3, "reps": 30, "unit": "reps", "icon": "sync-outline", "gif": "https://media.tenor.com/I8_axDdrntoAAAAi/russian-twist.gif"},
    ],
    "full_body": [
        {"name": "Burpees", "sets": 3, "reps": 12, "unit": "reps", "icon": "flame-outline", "gif": "https://media.tenor.com/RR59n2VnxJ8AAAAi/burpee.gif"},
        {"name": "Jumping Jacks", "sets": 3, "reps": 30, "unit": "reps", "icon": "expand-outline", "gif": "https://media.tenor.com/y3OL5JtCKWcAAAAi/jumping-jacks.gif"},
        {"name": "Push Ups", "sets": 3, "reps": 15, "unit": "reps", "icon": "fitness-outline", "gif": "https://media.tenor.com/UMl7iEdvSh4AAAAi/push-ups.gif"},
        {"name": "Squats", "sets": 3, "reps": 20, "unit": "reps", "icon": "body-outline", "gif": "https://media.tenor.com/zUDxV5LpkxsAAAAi/squat.gif"},
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "gif": "https://media.tenor.com/0zG9_v01rXEAAAAi/plank-exercise.gif"},
        {"name": "Mountain Climbers", "sets": 3, "reps": 20, "unit": "reps", "icon": "flash-outline", "gif": "https://media.tenor.com/X-7zT3PUiPYAAAAi/mountain-climbers.gif"},
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
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("logged_at", 1).to_list(1000)
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
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("logged_at", 1).to_list(500)
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
    msgs = await db.chat_history.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", 1).to_list(200)
    return {"messages": msgs}


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
