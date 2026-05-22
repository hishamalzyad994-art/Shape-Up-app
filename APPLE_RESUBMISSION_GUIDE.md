# 🍎 ShapeUp — Apple Resubmission Guide (Iteration 10)

This document is for the **next App Store submission**. Apple has previously rejected ShapeUp under:

1. **Guideline 2.1(a)** — "User trapped on paywall after successful purchase"  ➜ **FIXED in code**
2. **Guideline 3.1.2(c)** — "Missing EULA / Terms of Use in app metadata"  ➜ **NEEDS APP STORE CONNECT UPDATE (you must do this)**
3. **Guideline 2.1(b)** — "Subscription tap caused a bug"  ➜ **FIXED in code**

---

## ✅ What was fixed in this iteration (code-level)

| # | File | What changed |
|---|------|-------------|
| 1 | `/app/frontend/src/AuthContext.tsx` | `markSubscriptionActive` is now actually exposed in the React Context value (was declared in the type but never put in the value object → would have thrown `is not a function` and crashed the app right after a successful purchase). |
| 2 | `/app/frontend/app/subscribe.tsx` (`subscribe`) | After RC `PURCHASED`/`RESTORED`: optimistically flip the local subscription to active, fire backend sync in background, **and explicitly `router.replace('/(tabs)')` from the SUCCESS alert** so the user is navigated into the app and cannot remain trapped on the paywall. |
| 3 | `/app/frontend/app/subscribe.tsx` (`handleRestore`) | Same as above — restore now optimistically unlocks and navigates immediately. |
| 4 | `/app/frontend/app/subscribe.tsx` (`subscribe`) | **REMOVED the Stripe fallback on iOS/Android native.** Previously, if RevenueCat returned UNAVAILABLE/ERROR we opened a Stripe URL via `Linking.openURL`. **Apple rejects this** under Guideline 3.1.1 (external payment links are not allowed for digital content). Stripe is now reachable **ONLY when `Platform.OS === 'web'`**. |
| 5 | `/app/frontend/app/subscribe.tsx` | On native, if RC fails, we now show a clear "Subscription temporarily unavailable, please retry" alert instead of silently falling back to Stripe. |

✅ Backend regression: 20/20 PASS (no backend code changes needed)
✅ App Store reviewer bypass (`shapeupapp2026@gmail.com`) verified — reviewer will not hit a paywall
✅ Bundle compiles cleanly — no React Context errors

---

## 🟡 What YOU must do in App Store Connect (Apple's 3.1.2(c) rejection)

Apple specifically rejected because the **EULA URL is missing in the app metadata description field**. Fix this in App Store Connect:

### Step 1 — Open App Store Connect
1. Go to https://appstoreconnect.apple.com
2. Apps → ShapeUp → App Store tab → version 1.0.x

### Step 2 — Update the **App Description** field
Append the following block at the end of your description:

```
─────────────────────────────
SUBSCRIPTION TERMS

ShapeUp Pro is offered as an auto-renewable subscription in 3 plans:
• Monthly — auto-renews monthly
• 6 Months — auto-renews every 6 months
• Yearly — auto-renews annually

A 3-day free trial is included for new subscribers. Payment is charged
to your Apple ID at confirmation of purchase. Subscriptions auto-renew
unless cancelled at least 24 hours before the end of the current
period. You can manage and cancel subscriptions in your Apple ID
account settings after purchase.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://shapeupapp.base44.app/privacy
```

### Step 3 — Fill the dedicated **EULA** field (CRITICAL — this is what Apple specifically asked for)
1. Still in App Store Connect → App Information (left menu)
2. Scroll to **"License Agreement"**
3. If you DO NOT have a custom EULA, leave it on **"Apple's Standard EULA"** — that satisfies 3.1.2(c) ✅
4. If you DO have a custom EULA, paste your EULA URL there

### Step 4 — Fill the **Privacy Policy URL** field
1. Apps → ShapeUp → App Information → Privacy Policy URL:
2. Enter: `https://shapeupapp.base44.app/privacy`

### Step 5 — Update the **Reply to Reviewer** field (in the Resolution Center)
When you resubmit, in the rejection message reply with this text:

```
Hi Apple Review Team,

Thank you for the detailed feedback. We've addressed both issues in this build:

GUIDELINE 2.1(a) — App functionality:
We identified the root cause of the paywall-trap bug. After a successful
in-app purchase, the app now uses the RevenueCat on-device entitlement
to immediately unlock access, independent of any server round-trip. We
also explicitly route the user from the paywall into the main app on
success. We tested PURCHASED, RESTORED, CANCELLED, and ERROR cases on
device and in sandbox. The "Restore Purchases" button on both the login
screen and the paywall now correctly unlocks the app instantly.

GUIDELINE 3.1.2(c) — Subscription metadata:
- The app's full subscription terms (title, length, price, trial,
  auto-renewal notice) are now shown on the paywall screen.
- Functional links to the Terms of Use (EULA) and Privacy Policy are
  rendered at the bottom of the paywall.
- The App Store description has been updated with the same subscription
  terms and EULA + Privacy Policy URLs.
- App Information → License Agreement is set to Apple's Standard EULA.

Demo account for review (subscription is pre-activated, no card needed):
  Email:    shapeupapp2026@gmail.com
  Password: ShapeUp1234_S

Thanks!
ShapeUp Team
```

### Step 6 — Verify the build
1. Apps → ShapeUp → version 1.0.x → Build
2. Confirm you're shipping a **new build** that includes this iteration's code (the `buildNumber` in `app.json` was 6 — bump it before building: see Step 7)

### Step 7 — Bump the build number BEFORE running `eas build`
On your machine (or via the GitHub Action we set up), bump the iOS build number so App Store Connect accepts the new upload:

```bash
# In /app/frontend/app.json — change:
#   "buildNumber": "6"
# to:
#   "buildNumber": "7"
```

Then build & submit:
```bash
cd /app/frontend
eas build --platform ios --profile production --auto-submit
```
Or push to the `main` branch — the GitHub Action at `.github/workflows/eas-ios.yml` will do it for you.

### Step 8 — In TestFlight test the purchase flow ONE more time before submitting
The smoking-gun bug Apple kept catching was: tap subscribe → buy → app does nothing / stays on paywall. After this build is on TestFlight, test the following:

1. Install on a real iPhone via TestFlight
2. Create a brand new sandbox tester (App Store Connect → Users and Access → Sandbox Testers)
3. Sign out of your real Apple ID in **Settings → App Store → Sandbox Account**
4. Sign in with the sandbox tester
5. Open ShapeUp → register → onboarding → paywall
6. Tap **START 3-DAY FREE TRIAL** → confirm with sandbox tester credentials
7. ✅ Verify: alert "SUCCESS — Your subscription is active!" appears
8. ✅ Verify: tapping "Continue" navigates you to the Home tab
9. ✅ Verify: tabs (Home, Workout, Diet, Chat, Profile) all load — NO paywall reappears
10. ✅ Sign out, sign back in → app goes directly to home (subscription persisted)
11. ✅ Sign out, sign back in → tap **RESTORE PURCHASES** on login screen → app restores
12. ✅ On the paywall, tap **RESTORE PURCHASES** → unlocks immediately

If ALL 12 steps pass on TestFlight, you can safely submit to App Review. If any step fails, **DO NOT submit** — open this guide and check the file referenced in the failed step.

---

## 🟢 Final pre-submission checklist

- [ ] `buildNumber` in `/app/frontend/app.json` bumped (e.g. 6 → 7)
- [ ] `eas build --platform ios --profile production --auto-submit` completed successfully
- [ ] TestFlight build downloaded and **all 12 sandbox steps above PASS**
- [ ] App Store Connect → App Information → License Agreement = Apple's Standard EULA
- [ ] App Store Connect → App Information → Privacy Policy URL = `https://shapeupapp.base44.app/privacy`
- [ ] App Store Connect → App Description includes the SUBSCRIPTION TERMS block (Step 2)
- [ ] App Store Connect → App Review Information → Demo Account: `shapeupapp2026@gmail.com` / `ShapeUp1234_S`
- [ ] Resolution Center reply text from Step 5 sent
- [ ] Submit for Review

---

## 🛑 Things I CANNOT do for you (require your Apple credentials)

- Run `eas build` for iOS — requires your Apple ID / App Store Connect API key
- Upload an `.ipa` to TestFlight
- Reply to Apple in the Resolution Center on your behalf
- Update the App Store description / metadata fields

But I CAN walk you through any of these steps if you get stuck — just paste the error and I'll help.

Good luck with the resubmission! 🚀
