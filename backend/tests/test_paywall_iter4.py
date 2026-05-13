"""Iteration 4: Hard paywall enforcement tests.
Verifies that premium endpoints return 402 for users without active subscription,
while auth/profile/weight/weekly/subscription endpoints remain accessible (200)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://slim-challenge-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = f"pw_{uuid.uuid4().hex[:8]}@cy.com"
PASSWORD = "pass123"
state = {}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def auth():
    return {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}


# ---- Bootstrap fresh user (no active sub) ----
def test_register_fresh(client):
    r = client.post(f"{API}/auth/register",
                    json={"email": EMAIL, "password": PASSWORD, "name": "Paywall Tester"}, timeout=20)
    assert r.status_code == 200, r.text
    state["token"] = r.json()["token"]


def test_complete_profile(client):
    # Profile required so paywall (not 400) is what blocks workout endpoints
    r = client.put(f"{API}/profile", headers=auth(), json={
        "age": 30, "gender": "male", "height_cm": 175, "weight_kg": 80,
        "target_weight_kg": 75, "goal": "fat_loss", "activity": "moderate",
        "difficulty": "medium", "body_focus": ["belly"]
    }, timeout=15)
    assert r.status_code == 200, r.text


# ---- Premium endpoints MUST return 402 ----
def test_workouts_today_402(client):
    r = client.get(f"{API}/workouts/today", headers=auth(), timeout=15)
    assert r.status_code == 402, r.text
    assert "subscription" in r.json().get("detail", "").lower()


def test_workouts_complete_402(client):
    r = client.post(f"{API}/workouts/complete", headers=auth(),
                    json={"day": 1}, timeout=15)
    assert r.status_code == 402, r.text


def test_workouts_rate_402(client):
    r = client.post(f"{API}/workouts/rate", headers=auth(),
                    json={"day": 1, "rating": 5}, timeout=15)
    assert r.status_code == 402, r.text


def test_meals_plans_402(client):
    r = client.get(f"{API}/meals/plans", headers=auth(), timeout=15)
    assert r.status_code == 402, r.text


def test_chat_402(client):
    r = client.post(f"{API}/chat", headers=auth(),
                    json={"message": "Hi coach"}, timeout=20)
    assert r.status_code == 402, r.text


# ---- Endpoints that MUST stay accessible (200) ----
def test_auth_me_200(client):
    r = client.get(f"{API}/auth/me", headers=auth(), timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["email"] == EMAIL


def test_calories_200(client):
    r = client.get(f"{API}/calories", headers=auth(), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "target_calories" in body and body["target_calories"] > 0


def test_progress_weight_post_200(client):
    r = client.post(f"{API}/progress/weight", headers=auth(),
                    json={"weight_kg": 79.5}, timeout=15)
    assert r.status_code == 200, r.text


def test_progress_weight_get_200(client):
    r = client.get(f"{API}/progress/weight", headers=auth(), timeout=15)
    assert r.status_code == 200, r.text
    assert "logs" in r.json()


def test_progress_weekly_200(client):
    r = client.get(f"{API}/progress/weekly", headers=auth(), timeout=15)
    assert r.status_code == 200, r.text
    assert "weeks" in r.json()


def test_profile_put_200(client):
    r = client.put(f"{API}/profile", headers=auth(),
                   json={"language": "en"}, timeout=15)
    assert r.status_code == 200, r.text


def test_subscription_status_inactive_for_new_user(client):
    r = client.get(f"{API}/subscription/status", headers=auth(), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active"] is False
    assert body.get("plan") is None


def test_subscription_plans_200(client):
    r = client.get(f"{API}/subscription/plans", timeout=15)
    assert r.status_code == 200, r.text
    assert len(r.json()["plans"]) == 3


def test_subscription_checkout_creates_session(client):
    r = client.post(f"{API}/subscription/checkout", headers=auth(),
                    json={"plan": "monthly", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("url", "").startswith("https://")
    assert "session_id" in body


# ---- Unauthenticated calls still 401, not 402 ----
def test_workouts_today_unauth_401(client):
    r = client.get(f"{API}/workouts/today", timeout=15)
    assert r.status_code in (401, 403), r.text
