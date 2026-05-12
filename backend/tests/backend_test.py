"""Backend API tests for ShapeUp (formerly Change Yourself) - Iteration 2."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://slim-challenge-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = f"test_{uuid.uuid4().hex[:8]}@cy.com"
PASSWORD = "pass123"
NAME = "Test User"

state = {}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def auth_headers():
    return {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}


# ---- Auth ----
def test_register(client):
    r = client.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": NAME}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d and "user" in d
    assert d["user"]["email"] == EMAIL.lower()
    state["token"] = d["token"]
    state["user_id"] = d["user"]["id"]


def test_register_duplicate(client):
    r = client.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": NAME}, timeout=15)
    assert r.status_code == 409


def test_login(client):
    r = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    state["token"] = r.json()["token"]


def test_login_bad(client):
    r = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me(client):
    r = client.get(f"{API}/auth/me", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == EMAIL.lower()


def test_me_unauth(client):
    r = client.get(f"{API}/auth/me", timeout=15)
    assert r.status_code in (401, 403)


# ---- Profile (iteration 2: difficulty, target_reason, language, whistle_enabled) ----
def test_calories_before_profile(client):
    r = client.get(f"{API}/calories", headers=auth_headers(), timeout=15)
    assert r.status_code == 400


def test_profile_update_with_new_fields(client):
    body = {
        "age": 28, "gender": "male", "height_cm": 178, "weight_kg": 82,
        "target_weight_kg": 75, "activity": "moderate", "goal": "fat_loss",
        "body_focus": ["belly"],
        "difficulty": "hard",
        "target_reason": "Look great at my wedding",
        "language": "en",
        "whistle_enabled": True,
    }
    r = client.put(f"{API}/profile", headers=auth_headers(), json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    p = d["user"]["profile"]
    assert p["goal"] == "fat_loss"
    assert p["difficulty"] == "hard"
    assert p["target_reason"] == "Look great at my wedding"
    assert p["language"] == "en"
    assert p["whistle_enabled"] is True
    assert d["user"]["challenge_start"] is not None
    assert d["macros"]["target_calories"] > 0


def test_profile_invalid_difficulty(client):
    r = client.put(f"{API}/profile", headers=auth_headers(),
                   json={"difficulty": "extreme"}, timeout=15)
    assert r.status_code == 422


# ---- Calories includes BMI ----
def test_calories_includes_bmi(client):
    r = client.get(f"{API}/calories", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("bmr", "tdee", "target_calories", "protein_g", "carbs_g", "fats_g", "bmi", "bmi_category"):
        assert k in d, f"missing {k}"
    # 82 / 1.78^2 = 25.88 → over
    assert isinstance(d["bmi"], (int, float)) and d["bmi"] > 0
    assert d["bmi_category"] in ("under", "normal", "over", "obese")
    assert d["bmi_category"] == "over"


# ---- Workouts: scaling, gifs, difficulty field, no total_days, ongoing ----
def test_workouts_today_hard(client):
    r = client.get(f"{API}/workouts/today", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["focus"] == "belly"
    assert d["difficulty"] == "hard"
    assert "total_days" not in d, "ongoing mode: total_days must be absent"
    assert len(d["exercises"]) > 0
    # all exercises must have gif url
    for ex in d["exercises"]:
        assert ex.get("gif", "").startswith("http"), ex
    # plank base reps 45 → hard mult 1.3 → 58
    plank = next(e for e in d["exercises"] if e["name"] == "Plank")
    assert plank["reps"] == 58
    state["hard_plank_reps"] = plank["reps"]


def test_workouts_today_easy_scales_down(client):
    r = client.put(f"{API}/profile", headers=auth_headers(), json={"difficulty": "easy"}, timeout=15)
    assert r.status_code == 200
    r2 = client.get(f"{API}/workouts/today", headers=auth_headers(), timeout=15)
    d = r2.json()
    assert d["difficulty"] == "easy"
    plank = next(e for e in d["exercises"] if e["name"] == "Plank")
    # easy 0.7 → 45*0.7 ≈ 31.5 (float rounds to 31 or 32)
    assert plank["reps"] in (31, 32)
    assert plank["reps"] < state["hard_plank_reps"]


def test_workouts_today_crazy_scales_up(client):
    client.put(f"{API}/profile", headers=auth_headers(), json={"difficulty": "crazy"}, timeout=15)
    r = client.get(f"{API}/workouts/today", headers=auth_headers(), timeout=15)
    d = r.json()
    assert d["difficulty"] == "crazy"
    plank = next(e for e in d["exercises"] if e["name"] == "Plank")
    # crazy 1.6 → 72
    assert plank["reps"] == 72


def test_workout_complete_and_dedupe(client):
    r = client.post(f"{API}/workouts/complete", headers=auth_headers(), json={"day": 1}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["already"] is False
    assert d["streak"] == 1
    r2 = client.post(f"{API}/workouts/complete", headers=auth_headers(), json={"day": 1}, timeout=15)
    assert r2.json()["already"] is True
    assert r2.json()["streak"] == 1


# ---- Rate workout (new) ----
def test_rate_workout(client):
    body = {"day": 1, "rating": 5, "self_score": 4, "note": "Felt strong"}
    r = client.post(f"{API}/workouts/rate", headers=auth_headers(), json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "id" in d
    assert d["rating"] == 5
    assert d["self_score"] == 4
    assert d["note"] == "Felt strong"
    assert d["day"] == 1
    assert "_id" not in d


def test_rate_workout_invalid_rating(client):
    r = client.post(f"{API}/workouts/rate", headers=auth_headers(),
                    json={"day": 1, "rating": 9}, timeout=15)
    assert r.status_code == 422


# ---- Meals ----
def test_meal_plans(client):
    r = client.get(f"{API}/meals/plans", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["recommended"] == "fat_loss"
    assert set(d["plans"].keys()) == {"fat_loss", "muscle_gain", "healthy"}


# ---- Weight progress + weekly ----
def test_log_weight_and_get(client):
    r = client.post(f"{API}/progress/weight", headers=auth_headers(), json={"weight_kg": 81.5}, timeout=15)
    assert r.status_code == 200
    assert r.json()["weight_kg"] == 81.5
    time.sleep(0.2)
    r2 = client.post(f"{API}/progress/weight", headers=auth_headers(), json={"weight_kg": 81.0}, timeout=15)
    assert r2.status_code == 200
    g = client.get(f"{API}/progress/weight", headers=auth_headers(), timeout=15)
    assert g.status_code == 200
    logs = g.json()["logs"]
    assert len(logs) >= 2
    me = client.get(f"{API}/auth/me", headers=auth_headers(), timeout=15).json()
    assert me["profile"]["weight_kg"] == 81.0


def test_weekly_progress(client):
    r = client.get(f"{API}/progress/weekly", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "weeks" in d
    assert isinstance(d["weeks"], list)
    assert len(d["weeks"]) >= 1
    w = d["weeks"][0]
    for k in ("week", "avg_weight", "delta", "total_lost", "fat_loss_est"):
        assert k in w, f"missing {k} in weekly entry"
    assert w["week"] == 1


# ---- Chat (Claude Sonnet 4.5) ----
def test_chat_and_history(client):
    r = client.post(f"{API}/chat", headers=auth_headers(),
                    json={"message": "Quick tip in one sentence?"}, timeout=60)
    assert r.status_code == 200, r.text
    reply = r.json()["reply"]
    assert isinstance(reply, str) and len(reply) > 0
    h = client.get(f"{API}/chat/history", headers=auth_headers(), timeout=15)
    assert h.status_code == 200
    msgs = h.json()["messages"]
    assert len(msgs) >= 2
    assert msgs[-2]["role"] == "user"
    assert msgs[-1]["role"] == "assistant"
