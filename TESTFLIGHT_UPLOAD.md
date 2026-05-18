# 📲 Upload ShapeUp to TestFlight — Step-by-Step Guide

> ⚠️ **I cannot run this from the Emergent environment.** Building & uploading to TestFlight requires *your* Apple Developer credentials and *your* Expo (EAS) account — both must stay on your machine. Everything below runs **from your local laptop**.
>
> Total time: **~30 minutes of your attention + ~20 minutes of unattended cloud build**.

---

## ✅ What I've already set up for you in the repo

| File | What it does |
| --- | --- |
| `frontend/app.json` | iOS bundleId = `app.emergent.slimchallenge5de71fad6`, buildNumber = `1`, all permission strings, encryption flag, app icon |
| `frontend/eas.json` | Build profiles (development / preview / production) + a submit profile |
| `frontend/src/purchases.ts` | RevenueCat client wired with your iOS key |
| `backend/.env` | Slot for `REVENUECAT_SECRET_KEY` you'll fill in |
| `REVENUECAT_SETUP.md` | Full RevenueCat product/offering setup guide |

---

## 🧰 Pre-flight checklist — do these **once**, before the first build

### 1. Install the tools on your local Mac/PC

```bash
# Node 20+ already required by Expo
npm install -g eas-cli
```

### 2. Have these accounts ready

- [ ] **Apple Developer Program** — $99/year — https://developer.apple.com/programs (you must be enrolled and the account paid up)
- [ ] **Expo account** — free — sign up at https://expo.dev
- [ ] **App Store Connect access** to the team your Apple ID belongs to

### 3. Create the app in App Store Connect

1. Go to https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**
2. Platform: **iOS**
3. Name: `ShapeUp` *(must be globally unique — if taken try `ShapeUp Fitness`)*
4. Primary language: **English (U.S.)** or whichever
5. **Bundle ID**: select `app.emergent.slimchallenge5de71fad6` from the dropdown
   - *If it's not in the list* → go to https://developer.apple.com/account/resources/identifiers → **+** → register a new App ID with that exact bundle id, then come back here
6. **SKU**: anything you like, e.g. `shapeup-001`
7. Note down the **App Store Connect App ID** (a 10-digit number shown on the app's page URL — `https://appstoreconnect.apple.com/apps/<THIS_IS_THE_ID>/…`)
8. Note down your **Apple Team ID** (10-character alphanumeric) — find it at https://developer.apple.com/account → top-right → **Membership** tab → "Team ID"

### 4. Fill in `eas.json` submit profile

Open `frontend/eas.json` and replace the placeholders:

```jsonc
"submit": {
  "production": {
    "ios": {
      "appleId": "YOUR_APPLE_ID@example.com",   // ← your Apple ID email
      "ascAppId": "1234567890",                  // ← the 10-digit App Store Connect ID
      "appleTeamId": "ABCDE12345"                // ← your 10-char Team ID
    },
    ...
  }
}
```

### 5. (Once) link the project to your Expo account

```bash
cd /app/frontend           # or wherever your repo lives locally
eas login                  # log in with your Expo account
eas init                   # this writes `expo.extra.eas.projectId` into app.json — commit it
```

---

## 🚀 Build & upload — the **fast path** (one command)

```bash
cd frontend
eas build --platform ios --profile production --auto-submit
```

That single command will:
1. Upload your JS code to Expo's cloud build farm
2. Provision iOS signing certificates & provisioning profile (interactive prompts — say "Yes" to "let EAS handle this")
3. Compile a release `.ipa`
4. **Auto-upload** that `.ipa` straight to App Store Connect → TestFlight
5. The build will appear in TestFlight under **"Builds"** within ~10 minutes after the build finishes (Apple needs to process it)

**Expected total wait:** 15-25 minutes from `Enter` to seeing the build in TestFlight.

---

## 🚀 Build & upload — the **two-step path** (if you want more control)

```bash
# Step 1: build only
cd frontend
eas build --platform ios --profile production

# (Wait ~15 min — you'll get an email + a link to download the .ipa)

# Step 2: upload that build to App Store Connect
eas submit --platform ios --latest
```

---

## 🔐 Apple credentials — what EAS will ask you

The first time you run `eas build -p ios`, you'll be prompted:

1. **"Do you want EAS to manage your credentials?"** → **Yes** *(easiest path; EAS stores them encrypted)*
2. **Apple ID email** → enter it
3. **Apple password** → **use an "app-specific password"**, NOT your real password.
   - Generate one at https://appleid.apple.com → **Sign-in & Security** → **App-specific passwords** → **+**
   - Label it `EAS CLI` and paste the 4-block password (e.g. `abcd-efgh-ijkl-mnop`)
4. **Distribution certificate / Provisioning profile** → EAS auto-creates them in your Apple Developer portal

> 🛡 If you have 2FA on your Apple ID (you should), **the app-specific password is required** — your normal password will fail.

---

## 🧪 Set up TestFlight after the build appears

1. Go to https://appstoreconnect.apple.com → **My Apps** → **ShapeUp** → **TestFlight** tab
2. Wait ~10 min for "Processing" to finish on the build
3. Apple will email you about an "Encryption Compliance" question — I've already set `ITSAppUsesNonExemptEncryption: false` in `app.json` so it should auto-resolve, but you may need to manually answer "No — Standard encryption only (HTTPS)"
4. Under **Internal Testing** → **+** → create a group (e.g. "Beta Testers") → add yourself by Apple ID
5. Add the build to that group
6. Open the **TestFlight** app on your iPhone → sign in with the same Apple ID → install the build → run it 🎉

Once you've tested internally, you can promote it to **External Testing** (up to 10,000 testers) which requires a quick Apple beta-review (~24 hours).

---

## 🐞 Things that commonly go wrong

| Symptom | Fix |
| --- | --- |
| `Bundle identifier "app.emergent.slimchallenge5de71fad6" was not found in your Apple Developer account` | Register it at https://developer.apple.com/account/resources/identifiers |
| `Invalid Code Signing Entitlements` | Delete the cached profile: `eas credentials` → iOS → remove provisioning profile → rebuild |
| `Asset validation failed: missing privacy strings` | All required `NSXxxUsageDescription` are already set; if Apple adds more, edit `expo.ios.infoPlist` in `app.json` |
| RevenueCat purchases throw `2,500` error in the build | You haven't yet created the products `monthly` / `six_month` / `yearly` in App Store Connect → Subscriptions, or RevenueCat dashboard isn't linked. See `REVENUECAT_SETUP.md` |
| Build succeeds but TestFlight shows "Missing Compliance" | Open the build → answer "Does your app use encryption?" → "No" (because we set `ITSAppUsesNonExemptEncryption=false`) |
| `iOS bundle identifier already exists` when registering | Someone (maybe you previously) already registered it. Use the existing one or pick a new bundle id and update both `app.json` and your RevenueCat app entry |

---

## 🔁 Subsequent builds (after the first)

You only need to do the **Pre-flight checklist** once. After that, every new build is just:

```bash
cd frontend
eas build --platform ios --profile production --auto-submit
```

The `autoIncrement: true` setting in `eas.json` bumps the iOS `buildNumber` for you automatically so each upload gets a unique number TestFlight requires.

---

## 🧠 Tips before you go live

1. **Test the 3-day free trial on a real iPhone** with a sandbox tester account (App Store Connect → Users and Access → Sandbox testers) — Apple won't approve a paywall they can't test.
2. **Add screenshots & metadata** in App Store Connect → ShapeUp → App Information / Pricing & Availability → for the App Store **public** listing (not needed for TestFlight, but needed before final review).
3. **Privacy Manifest** — Apple now requires a `PrivacyInfo.xcprivacy` file. EAS auto-generates a minimal one for SDK 53+, but if you get a privacy-manifest warning, see https://docs.expo.dev/guides/apple-privacy.
4. **For Android Play Store later** — repeat the same flow with `--platform android` and a `play-service-account.json` from Google Play Console.

---

## 📞 If you hit something I can't help with from here

The pieces I **cannot** see or do from this environment:
- The actual `eas build` job (runs in Expo's cloud against your account)
- Apple's signing/notarization layer
- App Store Connect dashboard

If anything fails during those steps, paste the error message back to me and I'll diagnose it — most "build failed" issues turn out to be missing env vars / mis-configured app.json which I *can* fix here.

Good luck — your ShapeUp build is in great shape to ship. 💪
