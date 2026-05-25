# 📱 iPhone-Only TestFlight Upload Guide (No Mac Required)

> **HARSH TRUTH FIRST:** Emergent's "Deploy" button creates a **web preview only** — it does **NOT** build iOS apps or upload anything to App Store Connect. Every "successful deploy" you saw in Emergent between 1.0.3 and 1.0.11 was just the web preview being redeployed. **Zero .ipa files have been generated or sent to Apple in that range.** This is why nothing past 1.0.2 appears in App Store Connect.
>
> Version `1.0.2` (May 18) was the LAST real iOS upload — that one was made when an earlier agent helped you run `eas build` somewhere with a Mac/cloud workflow.
>
> To get **1.0.12 build #20** to TestFlight, you must run `eas build` + `eas submit` somewhere. Since you only have an iPhone, the only realistic free option is **GitHub Codespaces in Safari**. The full step-by-step is below.

---

## 📋 What I just fixed in the codebase

- `/app/frontend/app.json` — version bumped to **`1.0.12`**, buildNumber to **`20`** (well above anything Apple has seen → no CFBundleVersion conflict)
- `/app/frontend/eas.json` — your real Apple credentials are now in:
  - `appleId`: `hishamalzyad994@gmail.com`
  - `ascAppId`: `6770628833`
  - `appleTeamId`: `UFSNZ4RFFZ`
- `appVersionSource` switched from `"remote"` → `"local"` so the build number in app.json is the source of truth (predictable for you)
- The 3 App Store Rejection 2.1(a) code bugs are fixed (see `/app/APPLE_RESUBMISSION_GUIDE.md`)

The code is ready. You just need to ship it.

---

## 🚀 STEP-BY-STEP: How to upload 1.0.12 to TestFlight FROM YOUR iPHONE

You'll do all of this in **Safari on your iPhone**. The whole thing takes ~45 minutes (most of that is EAS's iOS build queue, which you can leave running and check back).

### PART A — Create an Expo account (5 min)
1. Open Safari → https://expo.dev
2. Tap **Sign Up** → use the same email as your Apple ID (`hishamalzyad994@gmail.com`) for simplicity
3. Verify your email
4. Save the password somewhere — you'll need it twice more

### PART B — Get the code into a GitHub repo (10 min, skip if already there)

If your code is **already in a GitHub repo** (i.e., the same one Emergent pushes to), skip this section.

If not:
1. Safari → https://github.com → Sign In (or sign up free)
2. Open a new tab → https://emergent.host (or wherever Emergent gives you the "Save to GitHub" / "Download Code" option)
3. Push your project to a new GitHub repo named something like `shapeup-app`. Emergent has a "Connect to GitHub" button somewhere in the dashboard — use that.

### PART C — Open GitHub Codespaces in iPhone Safari (5 min)

GitHub Codespaces gives you a **free Linux terminal that runs in your browser**, 60 hours/month free. It's the only way to run `eas build` on iPhone.

1. Safari → go to your GitHub repo (e.g. `github.com/yourname/shapeup-app`)
2. Tap the green **`< > Code`** button → tap **`Codespaces`** tab → tap **`Create codespace on main`**
3. Wait ~2 minutes for it to boot. You'll see a VS Code editor in your browser, full terminal at the bottom
4. If the terminal isn't open, tap **≡** (top-left menu) → **Terminal** → **New Terminal**

### PART D — Run the build (10 min for you, ~25 min for EAS to build)

In the Codespaces terminal, type these commands one by one. After each, wait for it to finish:

```bash
cd frontend
yarn install
```

```bash
npx eas login
```
- It'll prompt for your Expo email + password (from Part A) — type them, press Enter

```bash
npx eas credentials
```
- Choose: **iOS** → **production**
- It'll ask for your **Apple ID** → type: `hishamalzyad994@gmail.com`
- It'll ask for your **Apple ID password** → you need an **App-Specific Password** here, NOT your regular Apple password:
  
  **How to make an App-Specific Password (on iPhone):**
  - Open another Safari tab → https://account.apple.com/account/manage
  - Sign in with `hishamalzyad994@gmail.com`
  - Scroll to **Sign-In and Security** → tap **App-Specific Passwords** → **Generate password**
  - Name it `EAS Submit`
  - Apple shows a 16-char password like `abcd-efgh-ijkl-mnop` — copy it
  - Paste it into the Codespaces terminal where it's asking for the password
  
- It'll ask if you want EAS to manage credentials → say **Yes** (it'll auto-create the distribution certificate + provisioning profile)
- This step takes 2-3 minutes; just wait

Now actually build + submit:

```bash
npx eas build --platform ios --profile production --auto-submit --non-interactive
```

- This kicks off the build on Expo's cloud servers (Linux→macOS→Xcode→.ipa)
- Build takes 15-25 minutes — you can close Safari, the build keeps running on Expo's servers
- When it's done, EAS automatically calls **`eas submit`** which uploads the .ipa to App Store Connect

### PART E — Watch the progress on your iPhone (in another Safari tab)

While the build runs, you can monitor it:
1. Safari → https://expo.dev/accounts/[your-username]/projects/shapeup/builds
2. You'll see "iOS Production - Build #XX" with status:
   - 🟡 **In Queue** (waiting for a build server, usually <1 min on free tier)
   - 🔵 **In Progress** (15-25 min)
   - ✅ **Finished** → click into it → click **Submissions** tab → see if upload to App Store Connect succeeded
3. If the **Submission** tab shows ❌ Errored, tap it → read the error → message me

### PART F — Verify it landed in App Store Connect (5 min)

About **10-15 minutes after** EAS says "submission finished":
1. Safari → https://appstoreconnect.apple.com → sign in with `hishamalzyad994@gmail.com`
2. Apps → ShapeUp → **TestFlight** tab
3. You should now see **Version 1.0.12 Build 20** with status "Processing" (Apple takes 5-30 more min to process)
4. Once it goes from "Processing" to "Ready to Test", you're good

### PART G — Submit for App Review

Once Build #20 is "Ready to Test" in TestFlight:
1. Apps → ShapeUp → App Store tab → select 1.0.12
2. Scroll down to **Build** section → choose Build #20
3. Update App Description (paste the SUBSCRIPTION TERMS block from `/app/APPLE_RESUBMISSION_GUIDE.md` Step 2)
4. Confirm Apple's Standard EULA is selected (App Information → License Agreement)
5. Confirm Privacy URL is set: `https://shapeupapp.base44.app/privacy`
6. **Demo account** for reviewer: `shapeupapp2026@gmail.com` / `ShapeUp1234_S` (already configured)
7. Tap **Submit for Review**
8. In the reply-to-reviewer field, paste the message from `/app/APPLE_RESUBMISSION_GUIDE.md` Step 5

---

## 🆘 Troubleshooting

**"eas build" fails with "no Apple Distribution certificate"**
→ Re-run `npx eas credentials` and choose "Let EAS handle credentials"

**"Submit failed: Invalid Apple ID or password"**
→ You used your regular Apple password instead of an App-Specific Password. Generate one at https://account.apple.com → App-Specific Passwords

**Submit fails with "Build number already exists"**
→ Apple has a build with CFBundleVersion=20 already. Bump `buildNumber` in `/app/frontend/app.json` to `21` and re-run the build command

**Build shows ✅ Finished but TestFlight still doesn't show the build**
→ Open the build page → click "Submissions" tab → check the submission status separately. Build success ≠ submission success.

**Codespaces tells you "no more free hours this month"**
→ You used your 60-hour quota. Wait until next month, or use one of these alternatives:
   - **MacInCloud** (https://www.macincloud.com) — $1/hr, rent a Mac through Safari, run `eas build` there
   - **CodeAnywhere / Replit** — similar to Codespaces, free tier

---

## 💡 Future-proofing — make every subsequent upload one-tap

After Part D succeeds once, you can store your Expo token as a GitHub secret. After that, every push to `main` will auto-build + auto-submit (the workflow at `.github/workflows/eas-ios.yml` is already set up for this):

1. In Codespaces terminal: `npx expo whoami --json` to confirm you're logged in
2. Generate a token: https://expo.dev/accounts/[username]/settings/access-tokens → **Create Token** → copy
3. On iPhone Safari → your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
4. Name: `EXPO_TOKEN`, Value: paste the token, **Save**
5. From now on, edit any file in `/frontend/` via Emergent or GitHub.dev, commit, and the GitHub Action auto-builds and submits the new version 🚀

---

## TL;DR

- ❌ Emergent's "Deploy" doesn't upload to TestFlight — never has, never will
- ✅ Code is fixed and ready (version `1.0.12`, buildNumber `20`)
- 🏃 Action: Open GitHub Codespaces in iPhone Safari → run the 3 commands in Part D → watch the build → submit
- ⏱ Total time: ~45 min (mostly waiting)
- 💰 Cost: $0 (GitHub Codespaces + Expo free tier)
