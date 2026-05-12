# Change Yourself – 30-Day Weight Loss Challenge

## Overview
A React Native Expo mobile app that delivers a 30-day fitness transformation: daily workouts targeted at user-selected body parts, calorie/macro calculator (BMR/TDEE), curated meal plans, weight progress tracking, and an AI personal trainer powered by Claude Sonnet 4.5.

## Tech Stack
- **Frontend**: Expo SDK 54, expo-router (file-based navigation, tabs), AsyncStorage for token, TypeScript.
- **Backend**: FastAPI + Motor (async MongoDB), JWT auth with bcrypt, `emergentintegrations.llm.chat.LlmChat` for AI.
- **AI**: `claude-sonnet-4-5-20250929` via Emergent Universal Key.

## Core Features
1. **Auth** – JWT-based register/login screens with high-impact dark fitness aesthetic.
2. **Onboarding wizard** – age, gender, height, weight, target, goal, activity level, body focus.
3. **Home dashboard** – Day X/30, streak counter, progress bar, macro stats.
4. **Workout tab** – Body-part picker (Belly, Chest, Arms, Legs, Waist, Full body) + targeted exercise list with check-off and "Complete Day".
5. **Diet tab** – BMR/TDEE/macro card + 3 swappable meal plans (fat loss / muscle gain / healthy) with images & recipes.
6. **Chat tab** – Multi-turn AI coach with persistent history, conversational suggestions.
7. **Profile tab** – Start/Now/Target weight + weight-log history + streak/days-done stats + sign-out.

## Key Endpoints
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `PUT /api/profile`, `GET /api/calories`
- `GET /api/workouts/today`, `POST /api/workouts/complete`
- `GET /api/meals/plans`
- `POST /api/progress/weight`, `GET /api/progress/weight`
- `POST /api/chat`, `GET /api/chat/history`

## Design
"Performance Pro" archetype – black bg (`#050505`), electric red primary (`#FF3B30`), volt-lime accent (`#CCFF00`), sharp borders, uppercase bold typography.

## Monetisation Hook (future)
Premium subscription: AI voice coach, video exercise demos, custom meal plans, smartwatch sync.
