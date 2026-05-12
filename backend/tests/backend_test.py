"""Backend API tests for Change Yourself app."""
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


# ---- Profile ----
def test_calories_before_profile(client):
    r = client.get(f"{API}/calories", headers=auth_headers(), timeout=15)
    assert r.status_code == 400


def test_profile_update(client):
    body = {
        "age": 28, "gender": "male", "height_cm": 178, "weight_kg": 82,
        "target_weight_kg": 75, "activity": "moderate", "goal": "fat_loss",
        "body_focus": ["belly"],
    }
    r = client.put(f"{API}/profile", headers=auth_headers(), json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["profile"]["goal"] == "fat_loss"
    assert d["user"]["challenge_start"] is not None
    assert d["macros"]["target_calories"] > 0


def test_calories(client):
    r = client.get(f"{API}/calories", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("bmr", "tdee", "target_calories", "protein_g", "carbs_g", "fats_g"):
        assert k in d and d[k] > 0


# ---- Workouts ----
def test_workouts_today(client):
    r = client.get(f"{API}/workouts/today", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["focus"] == "belly"
    assert len(d["exercises"]) > 0
    assert d["day"] >= 1


def test_workout_complete_and_dedupe(client):
    r = client.post(f"{API}/workouts/complete", headers=auth_headers(), json={"day": 1}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["already"] is False
    assert d["streak"] == 1
    # second time should not increment
    r2 = client.post(f"{API}/workouts/complete", headers=auth_headers(), json={"day": 1}, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["already"] is True
    assert r2.json()["streak"] == 1


# ---- Meals ----
def test_meal_plans(client):
    r = client.get(f"{API}/meals/plans", headers=auth_headers(), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["recommended"] == "fat_loss"
    assert set(d["plans"].keys()) == {"fat_loss", "muscle_gain", "healthy"}


# ---- Weight progress ----
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
    assert logs[0]["logged_at"] <= logs[-1]["logged_at"]
    # profile.weight_kg should reflect latest
    me = client.get(f"{API}/auth/me", headers=auth_headers(), timeout=15).json()
    assert me["profile"]["weight_kg"] == 81.0


# ---- Chat (Claude) ----
def test_chat_and_history(client):
    r = client.post(f"{API}/chat", headers=auth_headers(), json={"message": "Quick tip in one sentence?"}, timeout=60)
    assert r.status_code == 200, r.text
    reply = r.json()["reply"]
    assert isinstance(reply, str) and len(reply) > 0
    h = client.get(f"{API}/chat/history", headers=auth_headers(), timeout=15)
    assert h.status_code == 200
    msgs = h.json()["messages"]
    assert len(msgs) >= 2
    assert msgs[-2]["role"] == "user"
    assert msgs[-1]["role"] == "assistant"
