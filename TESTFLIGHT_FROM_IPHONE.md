# 📱 Build & Upload ShapeUp to TestFlight — FROM YOUR iPHONE (no Mac required)

> ⚠️ This is a one-time setup. After it's done, every change you make in Emergent
> can be pushed to TestFlight just by saving to GitHub — no terminal needed for
> future builds.

There are TWO paths. Pick **Path A** if you want the absolute minimum work and
no recurring setup. Pick **Path B** if you want fully-automated builds on every
push.

---

## 🟢 Path A — One-time build using a free in-browser terminal (iPhone)

**Time:** ~40 minutes total (most of it waiting for Apple)

### Step 1 — Save your code to GitHub from Emergent
1. In Emergent, tap your **profile icon** (top right) → **Save to GitHub** *(or "Push to GitHub")*
2. Sign into GitHub when prompted (use Safari)
3. Pick **"Create a new repo"** → name it `shapeup` → Save
4. Wait until you see "✅ Pushed to GitHub"

### Step 2 — Create your Expo account on the phone
1. Open **https://expo.dev/signup** in Safari
2. Sign up with the same email you use for everything else (free)
3. Confirm the email

### Step 3 — Generate an Apple "app-specific password"
1. Open **https://appleid.apple.com** → sign in with your Apple ID
2. Tap **Sign-In & Security** → **App-Specific Passwords** → **+**
3. Label: `EAS Build` → Apple shows you a 4-block password like `abcd-efgh-ijkl-mnop`
4. **Copy** it — you'll paste it in 2 minutes

### Step 4 — Open a free in-browser terminal (no Mac needed)
1. Open **https://github.com** in Safari → sign in
2. Open your `shapeup` repo
3. Tap the **green "Code" button** → tap **"Codespaces"** tab → **"Create codespace on main"**
4. Wait ~1 minute. You're now inside a Linux terminal **on your phone**.

### Step 5 — Run these 4 commands (paste them one at a time)
```
cd frontend
npm install -g eas-cli
eas login
```
> When `eas login` asks for credentials, use the **Expo email + password** from Step 2.

```
eas build --platform ios --profile production --auto-submit
```
> When asked: **"Generate a new Apple Distribution Certificate?"** → say **Yes**.
> When asked for **Apple ID** → enter your normal Apple email.
> When asked for **password** → paste the **app-specific password** from Step 3.

### Step 6 — Wait 15–25 minutes
The build runs on Expo's cloud servers (free for first 30 builds/month). When
finished:
1. You'll get an email "Your build has finished processing"
2. The .ipa is **automatically** uploaded to App Store Connect → **TestFlight**
3. Open App Store Connect on your phone → **My Apps → ShapeUp → TestFlight**
   tab → wait ~10 more min for Apple to process the build
4. Build **1.0.4** appears, available to add to a test group

### Step 7 — Test on your iPhone
1. Install the **TestFlight** app from the App Store
2. In App Store Connect → TestFlight → **Internal Testing** → **+** → Add
   your Apple ID as a tester
3. Open TestFlight on your phone → tap **Install** under "ShapeUp"
4. Run the app 🎉

> **Codespaces note**: GitHub gives you 60 free Codespace hours per month. The
> session above uses ~5 minutes. You can stop or delete the codespace from
> github.com/codespaces afterwards.

---

## 🟢 Path B — Auto-build on every push (zero terminal use after first time)

I've already added the workflow file `.github/workflows/eas-ios.yml` to your
repo. After Path A is done **once**, do this so future builds are automatic:

1. On https://expo.dev → profile → **Access Tokens** → **+ Create token** → name
   `github` → copy the token (starts with `eas_...`)
2. On https://github.com → open your `shapeup` repo → **Settings** → **Secrets
   and variables** → **Actions** → **New repository secret**
   - Name: `EXPO_TOKEN`
   - Value: paste the token from step 1
3. Open Emergent and ask me to "**push the latest code to GitHub**" anytime you
   want a new build — the workflow will auto-build and submit the new version
   to TestFlight.
4. To trigger a build manually any time (no push needed): GitHub → your repo →
   **Actions** tab → **EAS Build & Submit to TestFlight** → **Run workflow** →
   choose `production` → tap green button.

---

## ❓ Quick FAQ

| Question | Answer |
| --- | --- |
| Do I really need an Apple Developer account? | Yes — TestFlight is only available to paid Apple Developer Program members ($99/yr). https://developer.apple.com/programs |
| What if Codespaces asks for payment? | The 60h/mo free tier doesn't need a card. Just don't enable "Spending limits". |
| Can I use Termius / iSH / other iOS terminal apps? | Not reliably — those don't have `node` installed and EAS CLI needs Node 18+. Codespaces is the safest free option. |
| My build failed — how do I share the log? | In Codespaces, tap the EAS build URL it printed (e.g. `https://expo.dev/accounts/.../builds/...`). Open it → screenshot the red error → paste here and I'll fix it from the code side. |
| The build succeeded but TestFlight says "Missing Compliance" | Open the build → answer **No** to "Does your app use encryption?". Already set this for you with `ITSAppUsesNonExemptEncryption: false` so it usually auto-passes. |

---

## 📞 If you get stuck

Paste **the exact error message** from the Codespaces terminal back to me. I
can fix anything that's in the code (`app.json`, `eas.json`, dependencies,
etc.). What I cannot fix is anything that requires your personal Apple/Expo
account login — that's still on you, but should only need to be done once.
