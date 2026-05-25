"""
One-shot seed script: upsert reviewer accounts so they always exist
with the correct password and have an active subscription. Idempotent.
Run from /app/backend with `python seed_reviewers.py`.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "changeyourself_db")

REVIEWERS = [
    ("shapeupapp2026@gmail.com",     "ShapeUp1234_S",  "ShapeUp Reviewer"),
    ("hishamalahmad999@gmail.com",   "Hisham1234_H",   "Hisham Alahmad"),
    ("hishamalzyad994@gmail.com",    "Hisham1234_H",   "Hisham Alzyad"),
    ("reviewshapeup@gmail.com",      "Test1234_Apple", "Apple Reviewer"),
]


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    users = db["users"]

    print(f"DB: {DB_NAME}")
    print(f"Mongo: {MONGO_URL[:40]}...")

    for email, password, name in REVIEWERS:
        email_norm = email.strip().lower()
        existing = await users.find_one({"email": email_norm})
        pwd_hash = hash_password(password)

        subscription = {
            "active": True,
            "plan": "yearly",
            "source": "reviewer",
            "purchased_at": now_utc().isoformat(),
            "access_expires_at": (now_utc() + timedelta(days=3650)).isoformat(),
            "last_payment_status": "paid",
            "auto_renew": False,
            "cancel_at_period_end": False,
        }

        if existing:
            await users.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "password": pwd_hash,
                    "name": existing.get("name") or name,
                    "subscription": subscription,
                    "has_used_trial": True,
                }}
            )
            print(f"✅ UPDATED {email_norm}  (user id {existing.get('id')})")
        else:
            user_id = str(uuid.uuid4())
            doc = {
                "id": user_id,
                "email": email_norm,
                "name": name,
                "password": pwd_hash,
                "created_at": now_utc().isoformat(),
                "profile": {
                    # minimal valid profile so the app skips onboarding
                    "age": 30, "gender": "male", "height_cm": 180,
                    "weight_kg": 80, "goal": "lose_weight",
                    "activity_level": "moderate",
                    "fitness_level": "intermediate",
                },
                "challenge_start": now_utc().isoformat(),
                "streak": 0,
                "completed_days": [],
                "has_used_trial": True,
                "subscription": subscription,
            }
            await users.insert_one(doc)
            print(f"✅ CREATED {email_norm}  (user id {user_id})")

    # quick verification
    print("\n--- Verification ---")
    for email, _, _ in REVIEWERS:
        u = await users.find_one({"email": email.strip().lower()})
        if u:
            sub = u.get("subscription") or {}
            print(f"  {email:38s} active={sub.get('active')} plan={sub.get('plan')} expires={sub.get('access_expires_at', '')[:10]}")
        else:
            print(f"  {email:38s} ❌ NOT FOUND")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
