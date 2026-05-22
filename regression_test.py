"""ShapeUp regression test - App Store Rejection 2.1(a) iteration.

Focus:
1. POST /api/purchases/sync   → soft-fail 200 when REVENUECAT_SECRET_KEY unset.
2. POST /api/purchases/webhook → 200 ignored when REVENUECAT_WEBHOOK_AUTH unset.
3. Reviewer bypass (shapeupapp2026@gmail.com) → active sub + workouts/today 200.
4. test@cy.com Pro regression suite (auth/me, subscription, workouts, chat, food).
5. Fresh user paywall regression (subscription/status inactive, food/scan + food/log 402).
"""
import os
import uuid
import requests

BASE = os.environ.get("BACKEND_BASE_URL", "https://slim-challenge-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

TEST_EMAIL = "test@cy.com"
TEST_PASSWORD = "pass123"

REVIEWER_EMAIL = "shapeupapp2026@gmail.com"
REVIEWER_PASSWORD = "ShapeUp1234_S"

results = []  # (label, ok, detail)


def _log(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {label}" + (f" :: {detail}" if detail else "")
    print(line)
    results.append((label, ok, detail))
    return ok


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def login(email, password):
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login failed for {email}: {r.status_code} {r.text}")
    return r.json()["token"], r.json().get("user", {})


def register_fresh():
    email = f"regr_{uuid.uuid4().hex[:10]}@cy.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "pass123", "name": "Regression User"},
                      timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"register failed: {r.status_code} {r.text}")
    return email, r.json()["token"]


# -------------------- 1. /purchases/sync soft-fail --------------------

def test_purchases_sync_soft_fail(token):
    r = requests.post(f"{API}/purchases/sync", headers=auth(token), timeout=30)
    ok = r.status_code == 200
    body = {}
    try:
        body = r.json()
    except Exception:
        ok = False
    note_ok = isinstance(body, dict) and "secret key" in (body.get("note") or "").lower()
    _log("purchases/sync soft-fail 200 (no REVENUECAT_SECRET_KEY)",
         ok and note_ok,
         f"status={r.status_code}, body={r.text[:250]}")
    return ok and note_ok


# -------------------- 2. /purchases/webhook ignore --------------------

def test_purchases_webhook_ignored():
    # Empty event body → should be ignored (no app_user_id).
    payload = {"event": {"type": "TEST", "id": str(uuid.uuid4())}, "api_version": "1.0"}
    r = requests.post(f"{API}/purchases/webhook", json=payload, timeout=30)
    ok_status = r.status_code == 200
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    ignored = isinstance(body, dict) and (body.get("ignored") is not None or body.get("ok") is True)
    _log("purchases/webhook returns 200 ignored (no auth env, no app_user_id)",
         ok_status and ignored,
         f"status={r.status_code}, body={r.text[:250]}")

    # Also try with an app_user_id that doesn't exist
    payload2 = {"event": {"type": "TEST", "app_user_id": "nope-" + uuid.uuid4().hex}}
    r2 = requests.post(f"{API}/purchases/webhook", json=payload2, timeout=30)
    ok2 = r2.status_code == 200
    body2 = {}
    try:
        body2 = r2.json()
    except Exception:
        pass
    _log("purchases/webhook unknown app_user_id → 200 ignored",
         ok2 and isinstance(body2, dict) and body2.get("ok") is True,
         f"status={r2.status_code}, body={r2.text[:200]}")


# -------------------- 3. Reviewer bypass --------------------

def test_reviewer_bypass():
    try:
        token, user = login(REVIEWER_EMAIL, REVIEWER_PASSWORD)
    except RuntimeError as e:
        _log("reviewer login (shapeupapp2026@gmail.com)", False, str(e))
        return None
    _log("reviewer login (shapeupapp2026@gmail.com)", True, f"user_id={user.get('id')}")

    # GET /api/subscription/status → active=true
    r = requests.get(f"{API}/subscription/status", headers=auth(token), timeout=30)
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    active = isinstance(body, dict) and body.get("active") is True
    _log("reviewer GET /subscription/status active=true",
         r.status_code == 200 and active,
         f"status={r.status_code}, active={body.get('active')}, source={body.get('source')}, plan={body.get('plan')}")

    # GET /api/workouts/today → 200 (not 402)
    r2 = requests.get(f"{API}/workouts/today", headers=auth(token), timeout=30)
    _log("reviewer GET /workouts/today 200 (paywall bypassed)",
         r2.status_code == 200,
         f"status={r2.status_code}, body={r2.text[:200]}")
    return token


# -------------------- 4. Pro account regression suite --------------------

def test_pro_regression(token):
    endpoints = [
        ("GET", "/auth/me", None),
        ("GET", "/subscription/status", None),
        ("GET", "/subscription/plans?country=US", None),
        ("GET", "/subscription/plans?country=GB", None),
        ("GET", "/workouts/today", None),
        ("GET", "/chat/history", None),
        ("GET", "/food/today", None),
    ]
    all_ok = True
    for method, path, _body in endpoints:
        url = f"{API}{path}"
        try:
            if method == "GET":
                r = requests.get(url, headers=auth(token), timeout=30)
            else:
                r = requests.post(url, headers=auth(token), json=_body or {}, timeout=30)
        except Exception as e:
            _log(f"Pro regression {method} {path}", False, f"exception={e}")
            all_ok = False
            continue
        ok = r.status_code == 200
        if not ok:
            all_ok = False
        _log(f"Pro regression {method} {path} == 200", ok,
             f"status={r.status_code}, body[:120]={r.text[:120]}")
    # Country-specific currency sanity
    for c, expected in [("US", "USD"), ("GB", "GBP")]:
        r = requests.get(f"{API}/subscription/plans?country={c}", headers=auth(token), timeout=30)
        try:
            b = r.json()
        except Exception:
            b = {}
        cur = b.get("currency") if isinstance(b, dict) else None
        _log(f"Pro regression /subscription/plans?country={c} currency={expected}",
             cur == expected, f"got currency={cur}")
    return all_ok


# -------------------- 5. Fresh user paywall regression --------------------

def test_fresh_paywall():
    email, token = register_fresh()
    _log("fresh user register", True, f"email={email}")

    r = requests.get(f"{API}/subscription/status", headers=auth(token), timeout=30)
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    not_active = isinstance(body, dict) and body.get("active") is False
    _log("fresh user /subscription/status active=false",
         r.status_code == 200 and not_active,
         f"status={r.status_code}, active={body.get('active')}, source={body.get('source')}")

    # /food/scan → 402 (POST with image_base64)
    r2 = requests.post(f"{API}/food/scan",
                       headers=auth(token),
                       json={"image_base64": "x" * 500},
                       timeout=30)
    _log("fresh user POST /food/scan → 402",
         r2.status_code == 402,
         f"status={r2.status_code}, body={r2.text[:150]}")

    # /food/log → 402
    r3 = requests.post(f"{API}/food/log",
                       headers=auth(token),
                       json={"name": "x", "calories": 100, "protein_g": 1, "carbs_g": 1, "fats_g": 1},
                       timeout=30)
    _log("fresh user POST /food/log → 402",
         r3.status_code == 402,
         f"status={r3.status_code}, body={r3.text[:150]}")


# -------------------- MAIN --------------------

def main():
    print(f"BASE URL: {BASE}")
    print("=" * 70)

    # Login Pro test user (test@cy.com)
    try:
        pro_token, _ = login(TEST_EMAIL, TEST_PASSWORD)
        _log("Pro login (test@cy.com)", True)
    except RuntimeError as e:
        _log("Pro login (test@cy.com)", False, str(e))
        pro_token = None

    print("\n--- Section 1: /purchases/sync soft-fail ---")
    if pro_token:
        test_purchases_sync_soft_fail(pro_token)

    print("\n--- Section 2: /purchases/webhook ignored ---")
    test_purchases_webhook_ignored()

    print("\n--- Section 3: Reviewer bypass ---")
    test_reviewer_bypass()

    print("\n--- Section 4: Pro regression suite ---")
    if pro_token:
        test_pro_regression(pro_token)

    print("\n--- Section 5: Fresh user paywall ---")
    test_fresh_paywall()

    # Summary
    print("\n" + "=" * 70)
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"TOTAL: {n_pass} PASS / {n_fail} FAIL out of {len(results)}")
    if n_fail:
        print("\nFailures:")
        for label, ok, detail in results:
            if not ok:
                print(f"  - {label} :: {detail}")
    return n_fail == 0


if __name__ == "__main__":
    import sys
    sys.exit(0 if main() else 1)
