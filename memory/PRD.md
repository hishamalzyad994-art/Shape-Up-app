# ShapeUp – AI Fitness App + Stripe Subscription

## Overview
ShapeUp is a React Native Expo + FastAPI + MongoDB fitness app with an AI personal trainer (Claude Sonnet 4.5), ongoing daily workouts targeted at user-chosen body parts with difficulty-scaled reps, calorie/macro/BMI calculator, meal plans, weekly progress, workout timer/whistle, rate-workout flow, AI coach chat, and **Stripe subscription paywall** via Emergent's managed Stripe integration proxy.

## Tech Stack
- **Frontend**: Expo SDK 54, expo-router, AsyncStorage, TypeScript
- **Backend**: FastAPI, Motor MongoDB, JWT auth (bcrypt)
- **AI**: `claude-sonnet-4-5-20250929` via `emergentintegrations.llm.chat` (Universal Key)
- **Payments**: `emergentintegrations.payments.stripe.checkout.StripeCheckout` (hosted Checkout) — routes via Emergent integration proxy

## Subscription Model
**One-time payment for fixed access period** (matches "stop charges when period ends, show resubscribe to continue"):
- **£3.99** → 30 days access (Monthly)
- **£19.99** → 180 days access (6 Months — 16% off)
- **£34.99** → 365 days access (Yearly — 27% off, BEST VALUE)

When access expires, user sees paywall + "Resubscribe" prompt. Extra purchases stack on top of remaining time.

## Subscription Endpoints
- `GET /api/subscription/plans` — pricing tiers
- `GET /api/subscription/status` — active/plan/access_expires_at
- `POST /api/subscription/checkout {plan, origin_url}` — returns Stripe Checkout URL + session_id
- `GET /api/subscription/poll/{session_id}` — frontend polls after redirect back; on first 'paid' status, grants access (idempotent, with retry/backoff to absorb proxy 404 race)

## Frontend Subscription UX
- `/subscribe` screen: hero "UNLOCK EVERYTHING", 3 plan cards with radio selector, BEST VALUE badge on yearly, benefits list, big SUBSCRIBE NOW CTA
- Home tab has a SHAPEUP PRO card linking to /subscribe
- After Stripe Checkout, redirects back with `?session_id=...` and frontend polls every 2s up to 60s, then alerts on success/timeout

## Test Coverage
- Iteration 1 (Change Yourself MVP): 14/14 tests
- Iteration 2 (ShapeUp + difficulty + timer + BMI + weekly + rating + i18n scaffold): 20/20 tests
- Iteration 3 (Stripe paywall): 31/32 tests (1 skipped due to environmental Emergent-proxy 404 race on freshly-minted sessions, mitigated by server-side retry)

## Notes / Known Limitations
1. Emergent's Stripe integration proxy occasionally returns 404 on a checkout session immediately after creation — our `/poll` endpoint retries 4× with backoff; in practice users redirected from Stripe arrive 5+ seconds later so the race is benign.
2. `emergentintegrations.payments.stripe.checkout.StripeCheckout.get_checkout_status` has a Pydantic v2 bug (metadata coerced to dict); we bypass with `stripe.checkout.Session.retrieve()` directly (the proxy api_base is already configured by `StripeCheckout.__init__`).
3. Apple Pay / Google Pay buttons render automatically inside Stripe Checkout on devices with those wallets configured (post-native-publish).

## Roadmap
- Webhook handler `payment_intent.succeeded` to replace polling (when Emergent exposes webhook signing secret)
- Cancel/refund endpoints
- Lock specific endpoints (workouts/chat/meals) behind `require_active_subscription` once user UX flows the full paywall
- Edit-workout feature, full Arabic UI translation + RTL, push notifications
- App Store / Google Play submission via Emergent publish button
