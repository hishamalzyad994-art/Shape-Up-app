from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt
import stripe
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

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


def _user_has_active_subscription(user: dict) -> bool:
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


async def require_active_subscription(user=Depends(get_current_user)):
    """Dependency that 402's if the user has no active subscription."""
    if not _user_has_active_subscription(user):
        raise HTTPException(status_code=402, detail="Subscription required")
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
    language: Optional[Literal['en', 'ar', 'es', 'fr', 'de', 'pt', 'it', 'hi', 'ja', 'tr']] = None
    country: Optional[str] = None  # ISO 3166-1 alpha-2 — used as fallback for regional pricing.
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


class ExerciseItem(BaseModel):
    name: str
    sets: int
    reps: int
    unit: str = "reps"
    icon: Optional[str] = "flash-outline"
    equipment: Optional[str] = "bodyweight"
    gif: Optional[str] = None


class CustomizeWorkoutRequest(BaseModel):
    focus: str
    exercises: List[ExerciseItem]


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
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        {"name": "Crunches", "sets": 3, "reps": 20, "unit": "reps", "icon": "fitness-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400"},
        {"name": "Hanging Leg Raises", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=400"},
        {"name": "Cable Crunch", "sets": 3, "reps": 15, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Mountain Climbers", "sets": 3, "reps": 20, "unit": "reps", "icon": "flash-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400"},
    ],
    "chest": [
        {"name": "Bench Press", "sets": 4, "reps": 10, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Incline Dumbbell Press", "sets": 3, "reps": 10, "unit": "reps", "icon": "trending-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Push Ups", "sets": 4, "reps": 15, "unit": "reps", "icon": "fitness-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
        {"name": "Cable Fly", "sets": 3, "reps": 12, "unit": "reps", "icon": "git-network-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583500178690-f7fd39f44e8d?w=400"},
        {"name": "Dumbbell Pullover", "sets": 3, "reps": 12, "unit": "reps", "icon": "ellipse-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
    ],
    "arms": [
        {"name": "Barbell Bicep Curl", "sets": 4, "reps": 10, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Dumbbell Hammer Curl", "sets": 3, "reps": 12, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
        {"name": "Tricep Rope Pushdown", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-down-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Skull Crushers", "sets": 3, "reps": 10, "unit": "reps", "icon": "skull-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583500178690-f7fd39f44e8d?w=400"},
        {"name": "Tricep Dips", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-down-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
    ],
    "legs": [
        {"name": "Barbell Back Squat", "sets": 4, "reps": 8, "unit": "reps", "icon": "body-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
        {"name": "Romanian Deadlift", "sets": 3, "reps": 10, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Leg Press", "sets": 4, "reps": 12, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400"},
        {"name": "Lunges", "sets": 3, "reps": 12, "unit": "each", "icon": "walk-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1434596922112-19c563067271?w=400"},
        {"name": "Leg Curl", "sets": 3, "reps": 12, "unit": "reps", "icon": "sync-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=400"},
        {"name": "Standing Calf Raise", "sets": 3, "reps": 15, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1535743686920-55e4145369b9?w=400"},
    ],
    "waist": [
        {"name": "Side Plank", "sets": 3, "reps": 30, "unit": "sec each", "icon": "timer-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        {"name": "Cable Wood Chop", "sets": 3, "reps": 12, "unit": "each", "icon": "leaf-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
        {"name": "Russian Twists (weighted)", "sets": 3, "reps": 20, "unit": "reps", "icon": "sync-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Standing Side Bend", "sets": 3, "reps": 15, "unit": "each", "icon": "swap-horizontal-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=400"},
    ],
    "back": [
        {"name": "Deadlift", "sets": 4, "reps": 6, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Pull Ups", "sets": 4, "reps": 8, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=400"},
        {"name": "Bent Over Row", "sets": 4, "reps": 10, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Lat Pulldown", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-down-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Seated Cable Row", "sets": 3, "reps": 12, "unit": "reps", "icon": "git-network-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583500178690-f7fd39f44e8d?w=400"},
    ],
    "shoulders": [
        {"name": "Overhead Press", "sets": 4, "reps": 8, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Dumbbell Lateral Raise", "sets": 3, "reps": 12, "unit": "reps", "icon": "swap-horizontal-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"},
        {"name": "Front Raise", "sets": 3, "reps": 12, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400"},
        {"name": "Face Pulls", "sets": 3, "reps": 15, "unit": "reps", "icon": "git-pull-request-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1583500178690-f7fd39f44e8d?w=400"},
        {"name": "Pike Push Ups", "sets": 3, "reps": 10, "unit": "reps", "icon": "fitness-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
    ],
    "full_body": [
        {"name": "Barbell Squat", "sets": 4, "reps": 8, "unit": "reps", "icon": "body-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
        {"name": "Deadlift", "sets": 3, "reps": 8, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
        {"name": "Bench Press", "sets": 3, "reps": 10, "unit": "reps", "icon": "barbell-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
        {"name": "Pull Ups", "sets": 3, "reps": 8, "unit": "reps", "icon": "arrow-up-outline", "equipment": "gym", "gif": "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=400"},
        {"name": "Burpees", "sets": 3, "reps": 12, "unit": "reps", "icon": "flame-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400"},
        {"name": "Plank", "sets": 3, "reps": 45, "unit": "sec", "icon": "timer-outline", "equipment": "bodyweight", "gif": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
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
async def workout_today(user=Depends(require_active_subscription)):
    profile = user.get("profile", {}) or {}
    focus_list = profile.get("body_focus") or ["full_body"]
    focus = focus_list[0] if focus_list else "full_body"
    difficulty = profile.get("difficulty", "medium")

    # If user has a custom-saved workout for this focus, use it as-is
    custom = await db.custom_workouts.find_one({"user_id": user["id"], "focus": focus}, {"_id": 0})
    if custom and custom.get("exercises"):
        exercises = custom["exercises"]
    else:
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
        "is_custom": bool(custom),
    }


@api_router.get("/exercises/library")
async def exercises_library(user=Depends(require_active_subscription)):
    """Return the full exercise catalogue grouped by focus, for the edit picker."""
    return {"library": EXERCISES_BY_FOCUS}


@api_router.post("/workouts/customize")
async def customize_workout(req: CustomizeWorkoutRequest, user=Depends(require_active_subscription)):
    if req.focus not in EXERCISES_BY_FOCUS:
        raise HTTPException(status_code=400, detail="Unknown focus area")
    if not req.exercises:
        raise HTTPException(status_code=400, detail="Workout must have at least one exercise")
    doc = {
        "user_id": user["id"],
        "focus": req.focus,
        "exercises": [e.dict() for e in req.exercises],
        "updated_at": now_utc().isoformat(),
    }
    await db.custom_workouts.update_one(
        {"user_id": user["id"], "focus": req.focus},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "focus": req.focus, "exercise_count": len(req.exercises)}


@api_router.delete("/workouts/customize/{focus}")
async def reset_workout(focus: str, user=Depends(require_active_subscription)):
    """Reset the custom workout for a focus back to the app default."""
    await db.custom_workouts.delete_one({"user_id": user["id"], "focus": focus})
    return {"ok": True, "focus": focus}


@api_router.post("/workouts/rate")
async def rate_workout(req: RateWorkoutRequest, user=Depends(require_active_subscription)):
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
async def complete_workout(req: CompleteDayRequest, user=Depends(require_active_subscription)):
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
async def meal_plans(user=Depends(require_active_subscription)):
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
async def chat(req: ChatRequest, user=Depends(require_active_subscription)):
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


# ============ FOOD SCAN (Vision LLM → calories + macros estimation) ============
import json as _json
import re as _re

class FoodScanRequest(BaseModel):
    image_base64: str  # raw base64 (no data: prefix); JPEG/PNG/WEBP
    note: Optional[str] = None  # optional user hint, e.g. "this is one bowl"

class FoodLogRequest(BaseModel):
    name: str
    calories: int
    protein_g: float = 0
    carbs_g: float = 0
    fats_g: float = 0
    portion: Optional[str] = None
    note: Optional[str] = None
    image_base64: Optional[str] = None  # optional thumbnail to store with the log

FOOD_VISION_SYS = (
    "You are a precise nutritionist analysing a single food photo. "
    "Return ONLY a JSON object (no markdown, no commentary) with these exact keys:\n"
    "  name: short dish name (e.g. 'Grilled chicken salad')\n"
    "  portion: estimated portion description (e.g. '1 medium plate, ~300g')\n"
    "  calories: integer kcal estimate for the visible portion\n"
    "  protein_g: integer or 1-decimal grams of protein\n"
    "  carbs_g: integer or 1-decimal grams of carbohydrates\n"
    "  fats_g: integer or 1-decimal grams of fat\n"
    "  confidence: 'low' | 'medium' | 'high'\n"
    "  note: one short sentence about assumptions or 'Add cooking oil if any'\n"
    "If the image does NOT contain food, return {\"error\":\"no_food\"}. "
    "Keep estimates realistic for the visible portion only. Be conservative."
)


def _parse_food_json(text: str) -> dict:
    """Robustly extract the JSON object from the model reply."""
    text = (text or "").strip()
    # Try direct parse first
    try:
        return _json.loads(text)
    except Exception:
        pass
    # Strip ``` fences
    m = _re.search(r"\{.*\}", text, _re.DOTALL)
    if m:
        try:
            return _json.loads(m.group(0))
        except Exception:
            pass
    return {"error": "parse_failed", "raw": text[:400]}


@api_router.post("/food/scan")
async def food_scan(req: FoodScanRequest, user=Depends(require_active_subscription)):
    if not req.image_base64 or len(req.image_base64) < 100:
        raise HTTPException(status_code=400, detail="Invalid image")
    # Strip optional data URL prefix
    b64 = req.image_base64
    if b64.startswith("data:"):
        try:
            b64 = b64.split(",", 1)[1]
        except Exception:
            pass

    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"food-{user['id']}-{uuid.uuid4().hex[:8]}",
        system_message=FOOD_VISION_SYS,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_text = "Identify the food in this photo and estimate calories + macros. Return JSON only."
    if req.note:
        user_text += f" User note: {req.note[:200]}"

    try:
        reply = await chat_client.send_message(UserMessage(
            text=user_text,
            file_contents=[ImageContent(image_base64=b64)],
        ))
    except Exception:
        logging.exception("Food vision LLM error")
        raise HTTPException(status_code=500, detail="Food scanning is temporarily unavailable. Please try again.")

    parsed = _parse_food_json(reply if isinstance(reply, str) else str(reply))
    if parsed.get("error") == "no_food":
        raise HTTPException(status_code=422, detail="We couldn't detect food in this photo. Try a clearer shot.")
    if parsed.get("error"):
        raise HTTPException(status_code=502, detail="AI returned an unexpected response. Please try again.")

    # Normalise numeric fields
    def _num(x, d=0.0):
        try: return float(x)
        except Exception: return d
    result = {
        "name": str(parsed.get("name") or "Unknown food")[:80],
        "portion": str(parsed.get("portion") or "")[:120],
        "calories": int(round(_num(parsed.get("calories"), 0))),
        "protein_g": round(_num(parsed.get("protein_g"), 0), 1),
        "carbs_g": round(_num(parsed.get("carbs_g"), 0), 1),
        "fats_g": round(_num(parsed.get("fats_g"), 0), 1),
        "confidence": str(parsed.get("confidence") or "medium")[:10],
        "note": str(parsed.get("note") or "")[:200],
    }
    return result


@api_router.post("/food/log")
async def food_log(req: FoodLogRequest, user=Depends(require_active_subscription)):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": req.name[:80],
        "portion": (req.portion or "")[:120],
        "calories": int(max(0, req.calories)),
        "protein_g": round(max(0.0, float(req.protein_g)), 1),
        "carbs_g": round(max(0.0, float(req.carbs_g)), 1),
        "fats_g": round(max(0.0, float(req.fats_g)), 1),
        "note": (req.note or "")[:200],
        "image_base64": (req.image_base64 or "")[:200_000] if req.image_base64 else None,
        "logged_at": now_utc().isoformat(),
        "date_key": now_utc().date().isoformat(),
    }
    await db.food_logs.insert_one(entry)
    entry.pop("_id", None)
    # Return today's totals along with the new entry
    today = await _food_today_totals(user["id"])
    return {"entry": {k: v for k, v in entry.items() if k != "image_base64"}, **today}


async def _food_today_totals(user_id: str) -> dict:
    date_key = now_utc().date().isoformat()
    cur = db.food_logs.find({"user_id": user_id, "date_key": date_key}, {"_id": 0, "image_base64": 0}).sort("logged_at", 1)
    items = await cur.to_list(None)
    totals = {"calories": 0, "protein_g": 0.0, "carbs_g": 0.0, "fats_g": 0.0}
    for it in items:
        totals["calories"] += int(it.get("calories") or 0)
        totals["protein_g"] += float(it.get("protein_g") or 0)
        totals["carbs_g"] += float(it.get("carbs_g") or 0)
        totals["fats_g"] += float(it.get("fats_g") or 0)
    totals["protein_g"] = round(totals["protein_g"], 1)
    totals["carbs_g"] = round(totals["carbs_g"], 1)
    totals["fats_g"] = round(totals["fats_g"], 1)
    return {"items": items, "totals": totals, "date": date_key}


@api_router.get("/food/today")
async def food_today(user=Depends(require_active_subscription)):
    return await _food_today_totals(user["id"])


@api_router.delete("/food/log/{entry_id}")
async def food_log_delete(entry_id: str, user=Depends(require_active_subscription)):
    res = await db.food_logs.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return await _food_today_totals(user["id"])


# ============ REVENUECAT (Native iOS / Android in-app purchases) ============
REVENUECAT_SECRET_KEY = os.environ.get("REVENUECAT_SECRET_KEY") or ""
REVENUECAT_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH") or ""
REVENUECAT_ENTITLEMENT = os.environ.get("REVENUECAT_ENTITLEMENT") or "shapeup_pro"
REVENUECAT_BASE_URL = "https://api.revenuecat.com/v1"


def _rc_pick_active_entitlement(subscriber: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return the matching active entitlement dict or None."""
    ents = (subscriber or {}).get("entitlements") or {}
    e = ents.get(REVENUECAT_ENTITLEMENT)
    if not e:
        return None
    exp_str = e.get("expires_date")
    if exp_str:
        try:
            exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if exp_dt < datetime.now(timezone.utc):
                return None
        except Exception:
            pass
    return e


async def _rc_fetch_subscriber(app_user_id: str) -> Dict[str, Any]:
    if not REVENUECAT_SECRET_KEY:
        raise HTTPException(status_code=503, detail="RevenueCat secret key not configured on server")
    url = f"{REVENUECAT_BASE_URL}/subscribers/{app_user_id}"
    headers = {
        "Authorization": f"Bearer {REVENUECAT_SECRET_KEY}",
        "Accept": "application/json",
        "X-Platform": "ios",
    }
    try:
        import httpx
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(url, headers=headers)
        if r.status_code >= 400:
            logging.warning("RevenueCat GET /subscribers failed: %s %s", r.status_code, r.text[:300])
            raise HTTPException(status_code=502, detail="RevenueCat lookup failed")
        return r.json() or {}
    except HTTPException:
        raise
    except Exception:
        logging.exception("RevenueCat REST error")
        raise HTTPException(status_code=502, detail="Could not reach RevenueCat")


async def _apply_rc_entitlement_to_user(user_id: str, subscriber: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror the RevenueCat 'shapeup_pro' entitlement into our local users.subscription doc."""
    active = _rc_pick_active_entitlement(subscriber)
    if active:
        product_id = (active.get("product_identifier") or "monthly").lower()
        plan = "yearly" if "year" in product_id else ("sixmonths" if "six" in product_id else "monthly")
        expires = active.get("expires_date")
        sub_doc = {
            "status": "active",
            "plan": plan,
            "source": "revenuecat",
            "auto_renew": True,
            "cancel_at_period_end": False,
            "access_expires_at": expires or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "rc_product_identifier": active.get("product_identifier"),
        }
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"subscription": sub_doc, "has_used_trial": True}},
        )
        return {"active": True, "plan": plan, "source": "revenuecat", "expires_at": sub_doc["access_expires_at"]}
    # No active entitlement → mark inactive (don't wipe trial flag though)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"subscription.status": "inactive", "subscription.source": "revenuecat"}},
    )
    return {"active": False, "source": "revenuecat"}


@api_router.post("/purchases/sync")
async def purchases_sync(user=Depends(get_current_user)):
    """Client calls this after a successful RevenueCat purchase or restore so the
    backend mirrors entitlement state to MongoDB (used by AI Coach, food scan, etc.)."""
    if not REVENUECAT_SECRET_KEY:
        # Soft-fail: client SDK already enforces gating on-device; just return current local state.
        return {"active": _user_has_active_subscription(user), "source": "local", "note": "RevenueCat secret key not configured on server."}
    data = await _rc_fetch_subscriber(user["id"])
    return await _apply_rc_entitlement_to_user(user["id"], data.get("subscriber") or {})


class RCWebhookEvent(BaseModel):
    event: Dict[str, Any]
    api_version: Optional[str] = None


@api_router.post("/purchases/webhook")
async def purchases_webhook(req: Request):
    """RevenueCat → our backend webhook. Configure under RC dashboard →
    Project → Integrations → Webhook. Use `REVENUECAT_WEBHOOK_AUTH` as the
    Authorization header value the dashboard sends."""
    auth = req.headers.get("authorization") or req.headers.get("Authorization") or ""
    if REVENUECAT_WEBHOOK_AUTH and auth != REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(status_code=401, detail="Invalid webhook auth")
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    event = body.get("event") or {}
    app_user_id = event.get("app_user_id") or (event.get("aliases") or [None])[0]
    if not app_user_id:
        return {"ok": True, "ignored": "no app_user_id"}
    user = await db.users.find_one({"id": app_user_id})
    if not user:
        return {"ok": True, "ignored": "user not found"}
    # Re-fetch full subscriber for safety
    try:
        data = await _rc_fetch_subscriber(app_user_id)
    except Exception:
        return {"ok": True, "ignored": "rc unreachable"}
    await _apply_rc_entitlement_to_user(app_user_id, data.get("subscriber") or {})
    return {"ok": True, "event_type": event.get("type")}


# ============ STRIPE SUBSCRIPTIONS (one-time access passes via emergentintegrations) ============
# User pays once for N days of access. After expiry → paywall + resubscribe prompt.
PLAN_CONFIG = {
    "monthly":   {"days": 30,  "label": "Monthly",  "stripe_interval": "month", "interval_count": 1},
    "sixmonths": {"days": 180, "label": "6 Months", "stripe_interval": "month", "interval_count": 6},
    "yearly":    {"days": 365, "label": "Yearly",   "stripe_interval": "year",  "interval_count": 1},
}
TRIAL_DAYS = 3
_recurring_price_cache: dict = {}

# Regional pricing — purchase-power adjusted, charged in user's local currency.
# Keys are ISO 3166-1 alpha-2 country codes (also a synthetic "EU" region for the eurozone).
REGIONAL_PRICING: Dict[str, Dict[str, Any]] = {
    "GB": {"currency": "gbp", "symbol": "£",    "code": "GBP", "monthly": 3.99,  "sixmonths": 19.99,  "yearly": 34.99,  "zero_decimal": False},
    "US": {"currency": "usd", "symbol": "$",    "code": "USD", "monthly": 4.99,  "sixmonths": 24.99,  "yearly": 44.99,  "zero_decimal": False},
    "CA": {"currency": "cad", "symbol": "CA$",  "code": "CAD", "monthly": 6.99,  "sixmonths": 34.99,  "yearly": 59.99,  "zero_decimal": False},
    "AU": {"currency": "aud", "symbol": "A$",   "code": "AUD", "monthly": 7.99,  "sixmonths": 39.99,  "yearly": 69.99,  "zero_decimal": False},
    "NZ": {"currency": "nzd", "symbol": "NZ$",  "code": "NZD", "monthly": 8.99,  "sixmonths": 44.99,  "yearly": 79.99,  "zero_decimal": False},
    "EU": {"currency": "eur", "symbol": "€",    "code": "EUR", "monthly": 4.49,  "sixmonths": 22.99,  "yearly": 39.99,  "zero_decimal": False},
    "CH": {"currency": "chf", "symbol": "CHF ", "code": "CHF", "monthly": 4.99,  "sixmonths": 24.99,  "yearly": 44.99,  "zero_decimal": False},
    "AE": {"currency": "aed", "symbol": "AED ", "code": "AED", "monthly": 18.99, "sixmonths": 89.99,  "yearly": 159.99, "zero_decimal": False},
    "SA": {"currency": "sar", "symbol": "SAR ", "code": "SAR", "monthly": 18.99, "sixmonths": 89.99,  "yearly": 159.99, "zero_decimal": False},
    "QA": {"currency": "qar", "symbol": "QR ",  "code": "QAR", "monthly": 18.99, "sixmonths": 89.99,  "yearly": 159.99, "zero_decimal": False},
    "KW": {"currency": "kwd", "symbol": "KD ",  "code": "KWD", "monthly": 1.49,  "sixmonths": 6.99,   "yearly": 12.99,  "zero_decimal": False},
    "EG": {"currency": "egp", "symbol": "EGP ", "code": "EGP", "monthly": 99.00, "sixmonths": 499.00, "yearly": 899.00, "zero_decimal": False},
    "IN": {"currency": "inr", "symbol": "₹",    "code": "INR", "monthly": 399.0, "sixmonths": 1999.0, "yearly": 3499.0, "zero_decimal": False},
    "JP": {"currency": "jpy", "symbol": "¥",    "code": "JPY", "monthly": 600,   "sixmonths": 2980,   "yearly": 5400,   "zero_decimal": True},
    "KR": {"currency": "krw", "symbol": "₩",    "code": "KRW", "monthly": 5900,  "sixmonths": 29900,  "yearly": 54900,  "zero_decimal": True},
    "BR": {"currency": "brl", "symbol": "R$",   "code": "BRL", "monthly": 24.99, "sixmonths": 119.99, "yearly": 219.99, "zero_decimal": False},
    "MX": {"currency": "mxn", "symbol": "MX$",  "code": "MXN", "monthly": 89.0,  "sixmonths": 449.0,  "yearly": 799.0,  "zero_decimal": False},
    "ZA": {"currency": "zar", "symbol": "R",    "code": "ZAR", "monthly": 89.0,  "sixmonths": 449.0,  "yearly": 799.0,  "zero_decimal": False},
    "TR": {"currency": "try", "symbol": "₺",    "code": "TRY", "monthly": 149.0, "sixmonths": 749.0,  "yearly": 1299.0, "zero_decimal": False},
    "NG": {"currency": "ngn", "symbol": "₦",    "code": "NGN", "monthly": 3999,  "sixmonths": 19999,  "yearly": 34999,  "zero_decimal": False},
    "SG": {"currency": "sgd", "symbol": "S$",   "code": "SGD", "monthly": 6.99,  "sixmonths": 34.99,  "yearly": 59.99,  "zero_decimal": False},
    "HK": {"currency": "hkd", "symbol": "HK$",  "code": "HKD", "monthly": 39.0,  "sixmonths": 199.0,  "yearly": 349.0,  "zero_decimal": False},
    "PH": {"currency": "php", "symbol": "₱",    "code": "PHP", "monthly": 249.0, "sixmonths": 1249.0, "yearly": 2199.0, "zero_decimal": False},
    "ID": {"currency": "idr", "symbol": "Rp",   "code": "IDR", "monthly": 75000, "sixmonths": 375000, "yearly": 659000, "zero_decimal": False},
}

# Countries that share the Euro (mapped to the "EU" pricing row above).
EUROZONE = {
    "AT","BE","CY","DE","EE","ES","FI","FR","GR","IE","IT","LV","LT","LU",
    "MT","NL","PT","SI","SK","HR","AD","MC","SM","VA","XK","ME",
}


def _resolve_pricing(country: Optional[str]) -> Dict[str, Any]:
    """Return regional pricing for a country code. Falls back to USD if unknown."""
    c = (country or "").strip().upper()
    if not c:
        return REGIONAL_PRICING["US"]
    if c in EUROZONE:
        return REGIONAL_PRICING["EU"]
    return REGIONAL_PRICING.get(c, REGIONAL_PRICING["US"])


def _format_money(p: Dict[str, Any], amount: float) -> str:
    """Render a currency-formatted display string for the plan card."""
    if p.get("zero_decimal"):
        return f"{p['symbol']}{int(round(amount)):,}"
    # Avoid trailing ".00" only when the symbol is multi-char like 'AED '
    return f"{p['symbol']}{amount:,.2f}"


def _plan_savings(plan_key: str, monthly_amount: float, plan_amount: float, months: int) -> Optional[str]:
    if plan_key == "monthly":
        return None
    full = monthly_amount * months
    if full <= 0:
        return None
    pct = round((1.0 - plan_amount / full) * 100)
    return f"{pct}% off" if pct >= 5 else None


async def get_or_create_recurring_price(plan_key: str) -> str:
    """Lazy-create a Stripe Product+Price for an auto-renewing plan via the emergent proxy."""
    cfg = PLAN_CONFIG[plan_key]
    if plan_key in _recurring_price_cache:
        return _recurring_price_cache[plan_key]
    doc = await db.stripe_prices.find_one({"plan": plan_key}, {"_id": 0})
    if doc and doc.get("price_id"):
        _recurring_price_cache[plan_key] = doc["price_id"]
        return doc["price_id"]
    product = stripe.Product.create(name=f"ShapeUp {cfg['label']} (auto-renew)")
    price = stripe.Price.create(
        product=product.id,
        unit_amount=int(round(cfg["amount"] * 100)),
        currency="gbp",
        recurring={"interval": cfg["stripe_interval"]},
    )
    await db.stripe_prices.update_one(
        {"plan": plan_key},
        {"$set": {"plan": plan_key, "price_id": price.id, "product_id": product.id}},
        upsert=True,
    )
    _recurring_price_cache[plan_key] = price.id
    return price.id


class CheckoutRequest(BaseModel):
    plan: Literal['monthly', 'sixmonths', 'yearly']
    origin_url: Optional[str] = None
    country: Optional[str] = None  # ISO 3166-1 alpha-2 (e.g. "US", "GB", "DE"). Used for regional pricing.


def is_subscription_active(user: dict) -> bool:
    return _user_has_active_subscription(user)


def _build_plan_list(country: Optional[str]) -> Dict[str, Any]:
    pricing = _resolve_pricing(country)
    monthly_amt = float(pricing["monthly"])
    six_amt     = float(pricing["sixmonths"])
    year_amt    = float(pricing["yearly"])
    return {
        "country": (country or "").upper() or None,
        "currency": pricing["code"],
        "symbol": pricing["symbol"],
        "zero_decimal": pricing.get("zero_decimal", False),
        "plans": [
            {
                "key": "monthly",
                "label": "Monthly",
                "amount": monthly_amt,
                "display": _format_money(pricing, monthly_amt),
                "period": "per month",
                "savings": None,
                "recurring": True,
            },
            {
                "key": "sixmonths",
                "label": "6 Months",
                "amount": six_amt,
                "display": _format_money(pricing, six_amt),
                "period": "every 6 months",
                "savings": _plan_savings("sixmonths", monthly_amt, six_amt, 6),
                "recurring": True,
            },
            {
                "key": "yearly",
                "label": "Yearly",
                "amount": year_amt,
                "display": _format_money(pricing, year_amt),
                "period": "per year",
                "savings": _plan_savings("yearly", monthly_amt, year_amt, 12),
                "recurring": True,
            },
        ],
    }


@api_router.get("/subscription/plans")
async def subscription_plans(country: Optional[str] = None, user=Depends(get_current_user)):
    has_used_trial = bool(user.get("has_used_trial", False))
    payload = _build_plan_list(country)
    payload.update({
        "trial_days": TRIAL_DAYS,
        "trial_eligible": not has_used_trial,
    })
    return payload


@api_router.post("/subscription/checkout")
async def subscription_checkout(req: CheckoutRequest, user=Depends(get_current_user)):
    if not stripe_checkout:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    cfg = PLAN_CONFIG[req.plan]
    pricing = _resolve_pricing(req.country)
    plan_amount = float(pricing[req.plan])
    currency_code = pricing["currency"]
    zero_decimal = bool(pricing.get("zero_decimal"))
    unit_amount = int(round(plan_amount)) if zero_decimal else int(round(plan_amount * 100))

    origin = (req.origin_url or APP_BASE_URL).rstrip('/')
    success_url = f"{origin}/subscribe?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/subscribe?cancelled=1"

    has_used_trial = bool(user.get("has_used_trial", False))
    trial_days = TRIAL_DAYS if not has_used_trial else 0

    subscription_data = {"metadata": {
        "user_id": user["id"],
        "plan": req.plan,
        "days": str(cfg["days"]),
        "country": (req.country or "").upper(),
        "currency": currency_code,
    }}
    if trial_days:
        subscription_data["trial_period_days"] = trial_days

    recurring = {"interval": cfg["stripe_interval"]}
    if cfg.get("interval_count") and cfg["interval_count"] != 1:
        recurring["interval_count"] = cfg["interval_count"]

    session = stripe.checkout.Session.create(
        customer_email=user["email"],
        mode="subscription",
        line_items=[{
            "price_data": {
                "currency": currency_code,
                "product_data": {"name": f"ShapeUp {cfg['label']}"},
                "unit_amount": unit_amount,
                "recurring": recurring,
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        subscription_data=subscription_data,
        payment_method_collection="always",  # require card even during trial
    )
    await db.payments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "session_id": session.id,
        "plan": req.plan,
        "amount": plan_amount,
        "currency": currency_code,
        "country": (req.country or "").upper() or None,
        "mode": "subscription",
        "trial_days": trial_days,
        "payment_status": "pending",
        "created_at": now_utc().isoformat(),
    })
    return {
        "url": session.url,
        "session_id": session.id,
        "plan": req.plan,
        "display": _format_money(pricing, plan_amount),
        "currency": pricing["code"],
        "recurring": True,
        "trial_days": trial_days,
    }


@api_router.post("/subscription/cancel")
async def subscription_cancel(user=Depends(get_current_user)):
    """Cancel an auto-renewing subscription at the end of the current period.
    User keeps access until access_expires_at; no further charges after that."""
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    sub = (fresh or {}).get("subscription") or {}
    sub_id = sub.get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=404, detail="No auto-renewing subscription to cancel")
    try:
        stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e}")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"subscription.cancel_at_period_end": True, "subscription.cancelled_at": now_utc().isoformat()}},
    )
    return {"ok": True, "cancel_at_period_end": True, "access_expires_at": sub.get("access_expires_at")}


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
        "auto_renew": bool(sub.get("auto_renew")),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
    }


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
        sub_doc = {
            "plan": plan,
            "amount": payment_doc["amount"],
            "purchased_at": now_utc().isoformat(),
            "access_expires_at": new_expires.isoformat(),
            "last_payment_status": "paid",
            "session_id": session_id,
            "auto_renew": bool(payment_doc.get("mode") == "subscription"),
            "cancel_at_period_end": False,
        }
        # For auto-renewing subs, capture the Stripe subscription id so we can cancel later
        if payment_doc.get("mode") == "subscription":
            try:
                stripe_sub_id = getattr(session, 'subscription', None)
                if stripe_sub_id:
                    sub_doc["stripe_subscription_id"] = stripe_sub_id
            except Exception:
                pass
        await db.users.update_one({"id": user["id"]}, {"$set": {"subscription": sub_doc, "has_used_trial": True}})
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
