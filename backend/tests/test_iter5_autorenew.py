"""Iteration 5: Auto-renewing monthly subscription + cancel endpoint tests."""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    # Try env first, fallback to /app/frontend/.env
    url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not url:
        try:
            with open('/app/frontend/.env') as f:
                for line in f:
                    if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                        url = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")
    return url.rstrip('/')

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

EMAIL = f"iter5_{uuid.uuid4().hex[:8]}@cy.com"
PASSWORD = "pass123"
state = {}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def auth_headers():
    return {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}


# ---- bootstrap ----
def test_bootstrap_register(client):
    r = client.post(f"{API}/auth/register",
                    json={"email": EMAIL, "password": PASSWORD, "name": "Iter5 Tester"}, timeout=20)
    assert r.status_code == 200, r.text
    state["token"] = r.json()["token"]
    state["user_id"] = r.json()["user"]["id"]


# ---- 1. Plans expose recurring flag ----
def test_plans_recurring_flags(client):
    r = client.get(f"{API}/subscription/plans", timeout=15)
    assert r.status_code == 200, r.text
    by_key = {p["key"]: p for p in r.json()["plans"]}
    assert by_key["monthly"]["recurring"] is True
    assert by_key["sixmonths"]["recurring"] is False
    assert by_key["yearly"]["recurring"] is False
    # period strings hint at recurrence
    assert "auto-renew" in by_key["monthly"]["period"].lower()
    assert "one-off" in by_key["sixmonths"]["period"].lower()
    assert "one-off" in by_key["yearly"]["period"].lower()


# ---- 2. Monthly checkout — recurring subscription mode ----
def test_checkout_monthly_recurring(client):
    body = {"plan": "monthly", "origin_url": BASE_URL}
    r = client.post(f"{API}/subscription/checkout", headers=auth_headers(),
                    json=body, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["recurring"] is True, f"Expected recurring=true for monthly, got: {d}"
    assert d["plan"] == "monthly"
    assert d["display"] == "£3.99"
    assert d["url"].startswith("http") and "stripe.com" in d["url"]
    assert d["session_id"]
    state["monthly_session"] = d["session_id"]


# ---- 3. 6-month + yearly checkout — one-off mode ----
def test_checkout_sixmonths_oneoff(client):
    r = client.post(f"{API}/subscription/checkout", headers=auth_headers(),
                    json={"plan": "sixmonths", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["recurring"] is False, f"Expected recurring=false for sixmonths, got: {d}"
    assert d["plan"] == "sixmonths"
    assert d["display"] == "£19.99"
    assert "stripe.com" in d["url"]


def test_checkout_yearly_oneoff(client):
    r = client.post(f"{API}/subscription/checkout", headers=auth_headers(),
                    json={"plan": "yearly", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["recurring"] is False, f"Expected recurring=false for yearly, got: {d}"
    assert d["plan"] == "yearly"
    assert d["display"] == "£34.99"
    assert "stripe.com" in d["url"]


# ---- 4. Cancel endpoint returns 404 when no active auto-renewing sub ----
def test_cancel_returns_404_without_active_sub(client):
    r = client.post(f"{API}/subscription/cancel", headers=auth_headers(), timeout=15)
    assert r.status_code == 404, r.text
    assert "No auto-renewing subscription" in r.json().get("detail", "")


def test_cancel_requires_auth(client):
    r = requests.post(f"{API}/subscription/cancel", timeout=15)
    assert r.status_code in (401, 403)


# ---- 5. Status response now exposes auto_renew + cancel_at_period_end ----
def test_status_exposes_autorenew_fields(client):
    r = client.get(f"{API}/subscription/status", headers=auth_headers(), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "auto_renew" in d, f"Missing auto_renew field: {d}"
    assert "cancel_at_period_end" in d, f"Missing cancel_at_period_end field: {d}"
    assert isinstance(d["auto_renew"], bool)
    assert isinstance(d["cancel_at_period_end"], bool)
    # Fresh user: no subscription, so both should be False
    assert d["active"] is False
    assert d["auto_renew"] is False
    assert d["cancel_at_period_end"] is False


# ---- 6. Paywall enforcement still works (regression check) ----
def test_paywall_workouts_today_402(client):
    r = client.get(f"{API}/workouts/today", headers=auth_headers(), timeout=15)
    assert r.status_code == 402, r.text


def test_paywall_meals_plans_402(client):
    r = client.get(f"{API}/meals/plans", headers=auth_headers(), timeout=15)
    assert r.status_code == 402, r.text


def test_paywall_chat_402(client):
    r = client.post(f"{API}/chat", headers=auth_headers(),
                    json={"message": "hi"}, timeout=20)
    assert r.status_code == 402, r.text
