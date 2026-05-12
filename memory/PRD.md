# ShapeUp – AI-Powered Fitness App

## Overview
React Native Expo + FastAPI + MongoDB fitness app with an AI personal trainer (Claude Sonnet 4.5). Ongoing daily workouts targeted at chosen body parts with difficulty-scaled reps, calorie/macro/BMI calculator, meal plans, weekly progress table, workout timer with whistle, rate-workout flow, and an AI coach chat. Bilingual scaffolding (EN/AR).

## Tech Stack
- **Frontend**: Expo SDK 54, expo-router, AsyncStorage, TypeScript
- **Backend**: FastAPI, Motor MongoDB, JWT auth (bcrypt)
- **AI**: `claude-sonnet-4-5-20250929` via `emergentintegrations` (Emergent Universal Key)

## Core Features (v2 – ShapeUp)
- **Auth**: JWT signup/login with bcrypt
- **Onboarding**: gender (👨/👩), age, height, weight, target, "why this target?", difficulty (easy/medium/hard/crazy), goal, activity, body focus
- **Home**: gender-emoji greeting, motivation quote, day counter (ongoing — no 30-day cap), streak, intensity, macro stats
- **Workout**: body-part picker, GIF/image per exercise, **timer with play/pause/reset + whistle sound** at start/end (toggleable), check-off, rate-workout modal (5-star + self-score + note)
- **Diet**: BMR/TDEE/macros + **BMI card with category color band** + 3 swappable meal plans
- **AI Coach C**: multi-turn chat (Claude Sonnet 4.5), profile-aware system prompt, persistent history
- **Profile**: avatar emoji, target_reason quote, streak/workouts done, weight log + **weekly progress table (avg / Δ / fat-loss estimate)**, **settings (whistle toggle, language EN/AR)**

## API Endpoints
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `PUT /api/profile` (now accepts `difficulty`, `target_reason`, `language`, `whistle_enabled`)
- `GET /api/calories` (returns BMR/TDEE/macros + **bmi/bmi_category**)
- `GET /api/workouts/today` (ongoing, difficulty-scaled reps, returns gif URLs)
- `POST /api/workouts/complete`, `POST /api/workouts/rate`
- `GET /api/meals/plans`
- `POST /api/progress/weight`, `GET /api/progress/weight`, `GET /api/progress/weekly`
- `POST /api/chat`, `GET /api/chat/history`

## Test Coverage
20/20 backend tests passing (`/app/backend/tests/backend_test.py`). All flows verified by testing-agent on iteration_2.

## Monetisation (next iteration)
Stripe auto-renewing subscription: £3.99/mo, £19.99/6mo, £34.99/yr. Cards + Apple Pay + Google Pay (native after publish). Paywall locks workouts/coach/meal-plans on lapse.

## Roadmap
- **Iteration 3**: Stripe subscription paywall, edit-workout (user customizes exercises), full i18n (Arabic UI translated everywhere, RTL layout)
- **Iteration 4**: App Store / Google Play publish via Emergent publish button, push notifications (water, meals, workouts), real-time whistle sound via expo-av on native, native Apple/Google Pay
