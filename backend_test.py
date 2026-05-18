"""Backend tests for ShapeUp - AI Food Scan endpoints + regressions."""
import os
import sys
import uuid
import base64
import json
import requests

BASE = os.environ.get("BACKEND_BASE_URL", "https://slim-challenge-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

TEST_EMAIL = "test@cy.com"
TEST_PASSWORD = "pass123"

# Unsplash food images (JPEG)
SALAD_URL = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400"
PIZZA_URL = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400"

results = []  # (label, ok, detail)


def _log(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {label}" + (f" :: {detail}" if detail else "")
    print(line)
    results.append((label, ok, detail))
    return ok


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def register_fresh():
    email = f"food_{uuid.uuid4().hex[:10]}@cy.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123", "name": "FoodTester"}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"register failed: {r.status_code} {r.text}")
    return email, r.json()["token"]


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login failed for {email}: {r.status_code} {r.text}")
    return r.json()["token"]


def download_b64(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return base64.b64encode(r.content).decode("ascii"), r.content


# ===================== TESTS =====================

def test_food_scan_paywall(fresh_token):
    r = requests.post(f"{API}/food/scan",
                      headers=auth(fresh_token),
                      json={"image_base64": "abcabcabc" * 50},
                      timeout=60)
    return _log("food/scan paywall (fresh user → 402)",
                r.status_code == 402,
                f"status={r.status_code}, body={r.text[:160]}")


def test_food_log_paywall(fresh_token):
    r = requests.post(f"{API}/food/log",
                      headers=auth(fresh_token),
                      json={"name": "x", "calories": 100, "protein_g": 1, "carbs_g": 1, "fats_g": 1},
                      timeout=30)
    return _log("food/log paywall (fresh user → 402)",
                r.status_code == 402,
                f"status={r.status_code}")


def test_food_today_paywall(fresh_token):
    r = requests.get(f"{API}/food/today", headers=auth(fresh_token), timeout=30)
    return _log("food/today paywall (fresh user → 402)",
                r.status_code == 402,
                f"status={r.status_code}")


def test_food_delete_paywall(fresh_token):
    r = requests.delete(f"{API}/food/log/bogus-id", headers=auth(fresh_token), timeout=30)
    return _log("food/log delete paywall (fresh user → 402)",
                r.status_code == 402,
                f"status={r.status_code}")


def test_food_scan_invalid_empty(token):
    r = requests.post(f"{API}/food/scan",
                      headers=auth(token),
                      json={"image_base64": ""},
                      timeout=30)
    return _log("food/scan invalid empty image (→ 400/422)",
                r.status_code in (400, 422),
                f"status={r.status_code}")


def test_food_scan_invalid_short(token):
    r = requests.post(f"{API}/food/scan",
                      headers=auth(token),
                      json={"image_base64": "abc"},
                      timeout=30)
    return _log("food/scan invalid short image (→ 400/422)",
                r.status_code in (400, 422),
                f"status={r.status_code}")


def test_food_scan_real_image(token, b64_image, label):
    r = requests.post(f"{API}/food/scan",
                      headers=auth(token),
                      json={"image_base64": b64_image, "note": "single serving"},
                      timeout=120)
    if r.status_code != 200:
        return _log(f"food/scan real image ({label})", False, f"status={r.status_code} body={r.text[:200]}")
    body = r.json()
    required = ["name", "portion", "calories", "protein_g", "carbs_g", "fats_g", "confidence", "note"]
    missing = [k for k in required if k not in body]
    if missing:
        return _log(f"food/scan real image ({label})", False, f"missing keys: {missing} body={body}")
    cals = body.get("calories", 0)
    conf_ok = body.get("confidence") in ("low", "medium", "high")
    plausible = 50 <= cals <= 2500  # generous range; we'll separately log if outside 100-1500
    ok = plausible and conf_ok and isinstance(body.get("name"), str)
    detail = f"name={body.get('name')!r}, cals={cals}, P/C/F={body.get('protein_g')}/{body.get('carbs_g')}/{body.get('fats_g')}, conf={body.get('confidence')}"
    if cals < 100 or cals > 1500:
        detail += " [WARN: outside 100-1500 expected range]"
    return _log(f"food/scan real image ({label})", ok, detail), body


def test_food_log_creates(token, payload):
    r = requests.post(f"{API}/food/log", headers=auth(token), json=payload, timeout=30)
    if r.status_code != 200:
        _log(f"food/log create ({payload.get('name')})", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    body = r.json()
    entry = body.get("entry")
    items = body.get("items")
    totals = body.get("totals")
    ok = (
        entry and entry.get("id") and entry.get("name") == payload["name"]
        and isinstance(items, list) and isinstance(totals, dict)
        and {"calories", "protein_g", "carbs_g", "fats_g"}.issubset(totals.keys())
        and body.get("date")
    )
    _log(f"food/log create ({payload.get('name')})", ok,
         f"id={entry.get('id') if entry else None}, totals={totals}, items_n={len(items) if items else 0}")
    return body


def test_food_today_totals(token, expected_count=None, expected_totals=None):
    r = requests.get(f"{API}/food/today", headers=auth(token), timeout=30)
    if r.status_code != 200:
        _log("food/today", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    body = r.json()
    items = body.get("items", [])
    totals = body.get("totals", {})
    date = body.get("date")
    ok = isinstance(items, list) and isinstance(totals, dict) and date
    if expected_count is not None:
        ok = ok and len(items) >= expected_count
    detail = f"date={date}, items={len(items)}, totals={totals}"
    if expected_totals is not None:
        cals_match = totals.get("calories") == expected_totals["calories"]
        p_match = round(float(totals.get("protein_g", 0)), 1) == round(expected_totals["protein_g"], 1)
        c_match = round(float(totals.get("carbs_g", 0)), 1) == round(expected_totals["carbs_g"], 1)
        f_match = round(float(totals.get("fats_g", 0)), 1) == round(expected_totals["fats_g"], 1)
        ok = ok and cals_match and p_match and c_match and f_match
        detail += f" | expected_match cals={cals_match} P={p_match} C={c_match} F={f_match}"
    _log("food/today totals", ok, detail)
    return body


def test_food_delete(token, entry_id, expected_drop):
    # snapshot before
    before = requests.get(f"{API}/food/today", headers=auth(token), timeout=30).json()
    r = requests.delete(f"{API}/food/log/{entry_id}", headers=auth(token), timeout=30)
    if r.status_code != 200:
        _log("food/log delete", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    after = r.json()
    bt = before["totals"]
    at = after["totals"]
    drop_cals = bt["calories"] - at["calories"]
    drop_p = round(bt["protein_g"] - at["protein_g"], 1)
    drop_c = round(bt["carbs_g"] - at["carbs_g"], 1)
    drop_f = round(bt["fats_g"] - at["fats_g"], 1)
    ok = (drop_cals == expected_drop["calories"]
          and abs(drop_p - expected_drop["protein_g"]) < 0.2
          and abs(drop_c - expected_drop["carbs_g"]) < 0.2
          and abs(drop_f - expected_drop["fats_g"]) < 0.2)
    _log("food/log delete totals drop", ok,
         f"drop cals={drop_cals} P={drop_p} C={drop_c} F={drop_f} | expected={expected_drop}")
    return after


def test_food_delete_bogus(token):
    r = requests.delete(f"{API}/food/log/does-not-exist-{uuid.uuid4().hex}", headers=auth(token), timeout=30)
    return _log("food/log delete bogus id (→ 404)", r.status_code == 404, f"status={r.status_code}")


# ===================== REGRESSIONS =====================

def test_regression_calories(token):
    r = requests.get(f"{API}/calories", headers=auth(token), timeout=30)
    return _log("regression GET /calories", r.status_code == 200, f"status={r.status_code}")


def test_regression_plans_gb(token):
    r = requests.get(f"{API}/subscription/plans?country=GB", headers=auth(token), timeout=30)
    if r.status_code != 200:
        return _log("regression GET /subscription/plans?country=GB", False, f"status={r.status_code}")
    body = r.json()
    ok = body.get("currency") == "GBP" and len(body.get("plans", [])) == 3
    return _log("regression GET /subscription/plans?country=GB", ok, f"currency={body.get('currency')}")


def test_regression_workouts_today(token):
    r = requests.get(f"{API}/workouts/today", headers=auth(token), timeout=30)
    return _log("regression GET /workouts/today", r.status_code == 200, f"status={r.status_code}")


def test_regression_chat_history(token):
    r = requests.get(f"{API}/chat/history", headers=auth(token), timeout=30)
    return _log("regression GET /chat/history", r.status_code == 200, f"status={r.status_code}")


# ===================== MAIN =====================

def main():
    print(f"Testing against {API}")
    print(f"Using test user: {TEST_EMAIL}")

    # === Fresh user paywall tests ===
    fresh_email, fresh_token = register_fresh()
    print(f"Fresh user: {fresh_email}")
    test_food_scan_paywall(fresh_token)
    test_food_log_paywall(fresh_token)
    test_food_today_paywall(fresh_token)
    test_food_delete_paywall(fresh_token)

    # === Subscribed user tests ===
    try:
        sub_token = login(TEST_EMAIL, TEST_PASSWORD)
    except Exception as e:
        _log("login test@cy.com", False, str(e))
        return print_summary()

    # Verify subscription is active
    r = requests.get(f"{API}/subscription/status", headers=auth(sub_token), timeout=30)
    sub_status = r.json() if r.status_code == 200 else {}
    print(f"test@cy.com subscription status: {sub_status}")
    if not sub_status.get("active"):
        _log("test@cy.com has active subscription", False, f"status={sub_status}")
        return print_summary()
    _log("test@cy.com has active subscription", True)

    # Invalid image inputs
    test_food_scan_invalid_empty(sub_token)
    test_food_scan_invalid_short(sub_token)

    # Real image scan
    try:
        salad_b64, _ = download_b64(SALAD_URL)
        print(f"Downloaded salad image: {len(salad_b64)} b64 chars")
    except Exception as e:
        _log("download salad image", False, str(e))
        salad_b64 = None

    scan_body = None
    if salad_b64:
        out = test_food_scan_real_image(sub_token, salad_b64, "salad")
        if isinstance(out, tuple):
            _, scan_body = out

    # Try pizza too if salad fails or for extra coverage
    try:
        pizza_b64, _ = download_b64(PIZZA_URL)
    except Exception as e:
        _log("download pizza image", False, str(e))
        pizza_b64 = None
    if pizza_b64:
        out = test_food_scan_real_image(sub_token, pizza_b64, "pizza")
        if isinstance(out, tuple) and not scan_body:
            _, scan_body = out

    # Clean today's log first (delete all existing entries to start fresh)
    today_before = requests.get(f"{API}/food/today", headers=auth(sub_token), timeout=30).json()
    for it in today_before.get("items", []):
        requests.delete(f"{API}/food/log/{it['id']}", headers=auth(sub_token), timeout=30)
    print(f"Cleaned {len(today_before.get('items', []))} existing food log entries for today")

    # Log 2 meals
    meal1 = {"name": "Grilled Chicken Salad", "calories": 420, "protein_g": 38.0, "carbs_g": 18.0, "fats_g": 22.0, "portion": "1 bowl"}
    meal2 = {"name": "Margherita Pizza Slice", "calories": 285, "protein_g": 12.0, "carbs_g": 36.0, "fats_g": 10.0, "portion": "1 slice"}

    r1 = test_food_log_creates(sub_token, meal1)
    r2 = test_food_log_creates(sub_token, meal2)

    if r1 and r2:
        # After 2 meals, totals should sum
        expected_totals = {
            "calories": meal1["calories"] + meal2["calories"],
            "protein_g": meal1["protein_g"] + meal2["protein_g"],
            "carbs_g": meal1["carbs_g"] + meal2["carbs_g"],
            "fats_g": meal1["fats_g"] + meal2["fats_g"],
        }
        # Verify r2's response totals reflect both
        r2_totals = r2.get("totals", {})
        sum_ok = (
            r2_totals.get("calories") == expected_totals["calories"]
            and round(float(r2_totals.get("protein_g", 0)), 1) == round(expected_totals["protein_g"], 1)
            and round(float(r2_totals.get("carbs_g", 0)), 1) == round(expected_totals["carbs_g"], 1)
            and round(float(r2_totals.get("fats_g", 0)), 1) == round(expected_totals["fats_g"], 1)
        )
        _log("food/log returns correct totals (sum of 2 entries)", sum_ok,
             f"got={r2_totals} expected={expected_totals}")

        test_food_today_totals(sub_token, expected_count=2, expected_totals=expected_totals)

        # Delete meal1, totals should drop by meal1's macros
        entry1_id = r1["entry"]["id"]
        drop_expected = {"calories": meal1["calories"], "protein_g": meal1["protein_g"], "carbs_g": meal1["carbs_g"], "fats_g": meal1["fats_g"]}
        test_food_delete(sub_token, entry1_id, drop_expected)

        # Verify today now has only meal2
        expected_after = {
            "calories": meal2["calories"],
            "protein_g": meal2["protein_g"],
            "carbs_g": meal2["carbs_g"],
            "fats_g": meal2["fats_g"],
        }
        test_food_today_totals(sub_token, expected_count=1, expected_totals=expected_after)

    # Bogus delete
    test_food_delete_bogus(sub_token)

    # === Regressions ===
    test_regression_calories(sub_token)
    test_regression_plans_gb(sub_token)
    test_regression_workouts_today(sub_token)
    test_regression_chat_history(sub_token)

    return print_summary()


def print_summary():
    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} passed")
    for label, ok, detail in results:
        if not ok:
            print(f"  FAIL: {label} :: {detail}")
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
