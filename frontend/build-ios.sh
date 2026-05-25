#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ShapeUp — one-shot iOS build + TestFlight submit script
# ─────────────────────────────────────────────────────────────────────────────
# Usage in Codespaces terminal:
#   bash frontend/build-ios.sh <APP-SPECIFIC-PASSWORD>
#
# Where <APP-SPECIFIC-PASSWORD> is the 16-character password (with dashes)
# you generated at:
#   https://account.apple.com  →  Sign-In and Security  →  App-Specific Passwords
#
# Example:
#   bash frontend/build-ios.sh abcd-efgh-ijkl-mnop
#
# This script will:
#   1. Authenticate to Expo using your access token (baked in below)
#   2. Authenticate to Apple using your App-Specific Password (you provide it)
#   3. Kick off a production iOS build on Expo's cloud servers (~25 min)
#   4. Auto-submit the .ipa to App Store Connect → TestFlight (~5 min)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # exit on any error

# ── Expo authentication (no browser/OAuth needed) ────────────────────────────
export EXPO_TOKEN="USor6VMcWq6pd1y_DbvFgQbVL86M7jMVho4jdHbj"

# ── Apple authentication (passed in as 1st argument) ─────────────────────────
APPLE_PWD="$1"

if [ -z "$APPLE_PWD" ]; then
  echo ""
  echo "❌ Missing Apple App-Specific Password."
  echo ""
  echo "Generate one at:"
  echo "  https://account.apple.com"
  echo "  → Sign-In and Security"
  echo "  → App-Specific Passwords"
  echo "  → Generate password (name it 'EAS')"
  echo ""
  echo "Then re-run:"
  echo "  bash frontend/build-ios.sh abcd-efgh-ijkl-mnop"
  echo "  (replace abcd-efgh-ijkl-mnop with YOUR 16-character password)"
  echo ""
  exit 1
fi

export EXPO_APPLE_ID="hishamalzyad994@gmail.com"
export EXPO_APPLE_APP_SPECIFIC_PASSWORD="$APPLE_PWD"
# Team ID + ASC App ID are already in eas.json (UFSNZ4RFFZ / 6770628833)

# ── Make sure we're in the frontend folder ───────────────────────────────────
cd "$(dirname "$0")"
echo "→ Working directory: $(pwd)"
echo ""

# ── Install dependencies (Expo needs node_modules to resolve plugins) ────────
if [ ! -d "node_modules" ] || [ ! -d "node_modules/expo-router" ]; then
  echo "→ Installing dependencies (this takes ~2 min the first time)..."
  if command -v yarn >/dev/null 2>&1; then
    yarn install --network-timeout 600000
  else
    npm install --legacy-peer-deps
  fi
  echo ""
else
  echo "→ Dependencies already installed, skipping yarn install"
  echo ""
fi

# ── Verify Expo auth ─────────────────────────────────────────────────────────
echo "→ Verifying Expo login..."
WHO=$(npx -y eas-cli@latest whoami 2>&1)
echo "   Expo user: $WHO"
if echo "$WHO" | grep -qi "not logged in"; then
  echo "❌ Expo token is invalid. Regenerate at https://expo.dev/settings/access-tokens"
  exit 1
fi
echo ""

# ── Build + auto-submit ──────────────────────────────────────────────────────
echo "→ Starting iOS build + auto-submit to TestFlight..."
echo "   This takes about 25-30 minutes. You can close Safari — the build"
echo "   keeps running on Expo's servers. Watch progress at:"
echo "   https://expo.dev/accounts/hishamalahmad999/projects/shapeup/builds"
echo ""

npx -y eas-cli@latest build \
  --platform ios \
  --profile production \
  --auto-submit \
  --non-interactive

echo ""
echo "✅ Done! If you see 'Build finished' above, check TestFlight in ~15 min:"
echo "   https://appstoreconnect.apple.com → Apps → ShapeUp → TestFlight"
