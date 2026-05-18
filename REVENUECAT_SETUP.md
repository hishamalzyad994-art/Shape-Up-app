# RevenueCat Integration — Next Steps

The ShapeUp app now has RevenueCat scaffolded for native iOS (and ready for Android). This document explains **how to flip it on** for a real device.

---

## 🔑 What's already done

| Piece | Status |
| --- | --- |
| `react-native-purchases` + `react-native-purchases-ui` SDKs installed | ✅ |
| `expo-dev-client` installed (required for native modules) | ✅ |
| `src/purchases.ts` cross-platform wrapper (short-circuits on web) | ✅ |
| RevenueCat configured in `AuthContext` with **JWT user id as appUserID** | ✅ |
| Subscribe screen: opens `presentPaywall()` on native, falls back to Stripe on web | ✅ |
| Profile → **MANAGE SUBSCRIPTION** opens RevenueCat **Customer Center** | ✅ |
| Subscribe screen has **RESTORE PURCHASES** button | ✅ |
| Backend `POST /api/purchases/sync` mirrors RC entitlement → MongoDB | ✅ |
| Backend `POST /api/purchases/webhook` accepts RC webhook events | ✅ |
| iOS bundle identifier set to `app.emergent.slimchallenge5de71fad6` (matches your RC app) | ✅ |
| Entitlement = `shapeup_pro`, Offering = `default` | ✅ |
| iOS API key wired via `EXPO_PUBLIC_RC_IOS_KEY` | ✅ |

---

## ✅ Configured RevenueCat IDs

```
iOS bundle id        : app.emergent.slimchallenge5de71fad6
iOS public API key   : appl_DAgnZllooTPxlKjplhccRzPsydJ
Entitlement          : shapeup_pro
Offering             : default
Product identifiers  : monthly, six_month, yearly
```

---

## 🚧 What you still need to do BEFORE it works on a device

### 1. Create products in App Store Connect

In **App Store Connect → My Apps → ShapeUp → Subscriptions / In-App Purchases**, create three auto-renewable subscriptions with these **exact product IDs**:

| Product ID  | Duration | Suggested price |
| ----------- | -------- | --------------- |
| `monthly`   | 1 month  | $4.99 / £3.99   |
| `six_month` | 6 months | $24.99 / £19.99 |
| `yearly`    | 1 year   | $44.99 / £34.99 |

Mark each one as offering a **3-day free trial introductory offer**.

You also need an **In-App Purchase Key (.p8)** from
**Users & Access → Integrations → In-App Purchase**.
Upload it to **RevenueCat → Project → Apps → (your iOS app) → App-specific settings → In-app purchase key configuration**.

### 2. Configure the RevenueCat dashboard

1. **Project → Products** — add `monthly`, `six_month`, `yearly` and attach each to the `shapeup_pro` entitlement.
2. **Project → Offerings → default** — make sure it contains three packages mapped to those products.
3. **Project → Paywalls** — design (or auto-generate) a paywall and attach it to the `default` offering.
4. *(Optional but recommended)* **Project → Customer Center** — turn it on and configure cancellation flows.

### 3. Add your secret API key on the backend

Edit `/app/backend/.env` and set:

```
REVENUECAT_SECRET_KEY=sk_xxxxxxxxxxxxxxxx
REVENUECAT_WEBHOOK_AUTH=any_random_string_you_pick
REVENUECAT_ENTITLEMENT=shapeup_pro
```

Get the secret key from **RevenueCat → Project Settings → API Keys → Secret keys**. **Never put this in the frontend.**

Then restart the backend:
```
sudo supervisorctl restart backend
```

### 4. Point the RevenueCat webhook at our backend

In **RevenueCat → Project → Integrations → Webhook**:

- **URL:**   `https://<your-public-host>/api/purchases/webhook`
- **Authorization header:** the same value you put in `REVENUECAT_WEBHOOK_AUTH`

This means cancellations, refunds, billing issues, and renewals automatically sync to MongoDB so the AI Coach & food scan remain correctly gated.

### 5. (Optional) Add Android

When ready, set `EXPO_PUBLIC_RC_ANDROID_KEY=goog_…` in `frontend/.env` and `expo.android.package` will need to match the package you registered with RevenueCat's Google Play app entry.

---

## 📦 How to build a testable device build

You **cannot** test RevenueCat in Expo Web or Expo Go. You must build a custom dev client:

```bash
cd /app/frontend
npx eas login
npx eas build:configure
npx eas build --profile development --platform ios
```

When the build finishes, install it on a real iPhone (or simulator with a sandbox tester signed in). Then run:

```bash
npx expo start --dev-client
```

The dev build will load your JS code with the native RevenueCat SDK linked in.

---

## 🧪 What works today in the preview / web

Even without doing any of the above, the app **still works in the Expo Web preview**:

- The `subscribe` screen detects that RC is unavailable and falls back to **Stripe Checkout** (test mode).
- The Customer Center button shows a "native only" alert.
- All other features (AI Coach, food scan, workouts, etc.) work normally.

So you can keep iterating in the preview while you wait for App Store Connect / Play Console approvals.

---

## 🧠 How the code is wired (mental model)

```
                        Native (iOS/Android)            Web/Preview
                        ───────────────────             ─────────────
Subscribe button   →    RevenueCat presentPaywall   ↔   Stripe Checkout URL
Restore            →    Purchases.restorePurchases  ↔   "Use the iOS app"
Manage button      →    RevenueCatUI.CustomerCenter ↔   "Use the iOS app"
On purchase        →    /api/purchases/sync         ↔   /api/subscription/poll
On renewal/cancel  →    RC Webhook → /api/purchases/webhook (server-to-server)
Entitlement check  →    RC SDK locally + Mongo mirror (used by AI Coach gating)
```

This means you have **one source of truth** (`users.subscription` in Mongo) which the AI Coach, food scan, and other Pro features read — regardless of whether the user paid via the App Store, Play Store, or Stripe on web.
