"""Backend tests for ShapeUp 3-day trial subscription flow."""
import os
import sys
import time
import uuid
import json
import asyncio
import requests

BASE = os.environ.get("BACKEND_BASE_URL", "https://slim-challenge-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "changeyourself_db"


def _print(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label}" + (f" :: {detail}" if detail else ""))
    return ok


def register_fresh():
    email = f"trial_{uuid.uuid4().hex[:10]}@cy.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123", "name": "T"}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return email, data["token"], data["user"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def flip_has_used_trial(email):
    from pymongo import MongoClient
    client = MongoClient(MONGO_URL)
    res = client[DB_NAME].users.update_one({"email": email.lower()}, {"$set": {"has_used_trial": True}})
    client.close()
    return res.modified_count


def test_subscription_plans_trial_eligible(token):
    r = requests.get(f"{API}/subscription/plans", headers=auth_headers(token), timeout=30)
    if r.status_code != 200:
        return _print("GET /subscription/plans (trial eligible)", False, f"{r.status_code} {r.text}")
    body = r.json()
    ok = (
        body.get("trial_days") == 3
        and body.get("trial_eligible") is True
        and isinstance(body.get("plans"), list)
        and len(body["plans"]) == 3
    )
    if not ok:
        return _print("GET /subscription/plans (trial eligible)", False, json.dumps(body))
    # Check plan details
    by_key = {p["key"]: p for p in body["plans"]}
    expected = {"monthly": (3.99, "£3.99"), "sixmonths": (19.99, "£19.99"), "yearly": (34.99, "£34.99")}
    for k, (amt, disp) in expected.items():
        p = by_key.get(k)
        if not p or p.get("amount") != amt or p.get("display") != disp:
            return _print("GET /subscription/plans (trial eligible)", False, f"plan {k} mismatch: {p}")
    return _print("GET /subscription/plans (trial eligible)", True, f"plans={list(by_key.keys())}")


def test_checkout(token, plan, expected_trial_days, label):
    r = requests.post(
        f"{API}/subscription/checkout",
        headers=auth_headers(token),
        json={"plan": plan, "origin_url": "http://localhost:3000"},
        timeout=60,
    )
    if r.status_code != 200:
        return _print(f"POST /subscription/checkout {label} ({plan})", False, f"{r.status_code} {r.text}")
    body = r.json()
    url = body.get("url", "")
    has_url = ("checkout.stripe.com" in url) or ("integrations.emergentagent.com" in url) or ("stripe.com" in url)
    ok = (
        has_url
        and isinstance(body.get("session_id"), str) and len(body["session_id"]) > 0
        and body.get("plan") == plan
        and body.get("trial_days") == expected_trial_days
        and body.get("recurring") is True
    )
    if not ok:
        return _print(f"POST /subscription/checkout {label} ({plan})", False, json.dumps({k: body.get(k) for k in ["url","session_id","plan","trial_days","recurring"]}))
    return _print(f"POST /subscription/checkout {label} ({plan})", True, f"trial_days={body['trial_days']} url_ok={has_url}")


def test_plans_after_trial_used(token):
    r = requests.get(f"{API}/subscription/plans", headers=auth_headers(token), timeout=30)
    if r.status_code != 200:
        return _print("GET /subscription/plans (post-trial)", False, f"{r.status_code} {r.text}")
    body = r.json()
    if body.get("trial_eligible") is not False:
        return _print("GET /subscription/plans (post-trial)", False, f"trial_eligible={body.get('trial_eligible')}")
    return _print("GET /subscription/plans (post-trial)", True, "trial_eligible=false")


def test_subscription_status(token, label="status"):
    r = requests.get(f"{API}/subscription/status", headers=auth_headers(token), timeout=30)
    return _print(f"GET /subscription/status ({label})", r.status_code == 200, f"{r.status_code}")


def test_workouts_today(token, expect_402=False):
    r = requests.get(f"{API}/workouts/today", headers=auth_headers(token), timeout=30)
    if expect_402:
        ok = r.status_code == 402
        return _print("GET /workouts/today (no sub, expect 402)", ok, str(r.status_code))
    return _print("GET /workouts/today", r.status_code == 200, f"{r.status_code} {r.text[:200] if r.status_code!=200 else ''}")


def test_exercises_library(token, expect_402=False):
    r = requests.get(f"{API}/exercises/library", headers=auth_headers(token), timeout=30)
    if expect_402:
        ok = r.status_code == 402
        return _print("GET /exercises/library (no sub, expect 402)", ok, str(r.status_code))
    return _print("GET /exercises/library", r.status_code == 200, f"{r.status_code}")


def test_chat(token, expect_402=False):
    r = requests.post(f"{API}/chat", headers=auth_headers(token), json={"message": "Give me a quick 2-line motivation"}, timeout=90)
    if expect_402:
        ok = r.status_code == 402
        return _print("POST /chat (no sub, expect 402)", ok, str(r.status_code))
    return _print("POST /chat", r.status_code == 200, f"{r.status_code} {r.text[:200] if r.status_code!=200 else ''}")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def main():
    print(f"Backend base: {API}")
    results = []

    # === Step 1: Fresh user, trial-eligible plans ===
    email, token, _ = register_fresh()
    print(f"Fresh user: {email}")
    results.append(("plans_trial_eligible", test_subscription_plans_trial_eligible(token)))

    # === Step 2: Checkout for all three plans, trial_days=3 ===
    results.append(("checkout_monthly_trial", test_checkout(token, "monthly", 3, "trial-eligible")))
    results.append(("checkout_sixmonths_trial", test_checkout(token, "sixmonths", 3, "trial-eligible")))
    results.append(("checkout_yearly_trial", test_checkout(token, "yearly", 3, "trial-eligible")))

    # === Step 3: Flip has_used_trial and re-test ===
    modified = flip_has_used_trial(email)
    print(f"DB: has_used_trial flipped, modified_count={modified}")
    results.append(("plans_post_trial", test_plans_after_trial_used(token)))
    results.append(("checkout_monthly_post_trial", test_checkout(token, "monthly", 0, "post-trial")))

    # === Step 4: Regression endpoints ===
    # Subscription status on fresh user (no active sub) - should still return 200
    results.append(("subscription_status_fresh", test_subscription_status(token, "fresh user")))

    # Workouts/today, /exercises/library, /chat require active subscription.
    # Fresh user has no subscription -> expect 402. Use the seeded test@cy.com user (has_used_trial=true, subscribed) for happy path.
    print("\n-- Regression with test@cy.com (subscribed user) --")
    try:
        sub_token = login("test@cy.com", "pass123")
        results.append(("workouts_today_subscribed", test_workouts_today(sub_token)))
        results.append(("exercises_library_subscribed", test_exercises_library(sub_token)))
        results.append(("subscription_status_subscribed", test_subscription_status(sub_token, "subscribed user")))
        results.append(("chat_subscribed", test_chat(sub_token)))
    except Exception as e:
        print(f"[FAIL] login test@cy.com :: {e}")
        results.append(("login_test_cy", False))

    print("\n==== SUMMARY ====")
    failed = [k for k, v in results if not v]
    for k, v in results:
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    print(f"\nTotal: {len(results)}, Passed: {len(results)-len(failed)}, Failed: {len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
