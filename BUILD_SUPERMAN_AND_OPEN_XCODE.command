#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "🦸 Building UX7.6.1 — Certificate-Safe Superman Build..."
echo ""

chmod -R u+rwX .
xattr -dr com.apple.quarantine . 2>/dev/null || true

echo "📺 Recovering the healthiest saved YouTube catalog..."
if ! node scripts/prepare-bundled-catalog.js; then
  echo "🌐 Trying the live GitHub catalog with macOS curl..."
  TMP_CATALOG="$(mktemp -t throupletea-catalog).json"
  if curl -fL --retry 3 --connect-timeout 20 \
    "https://raw.githubusercontent.com/3dudes1life/ThroupleTea-app/main/live-data/content.json?$(date +%s)" \
    -o "$TMP_CATALOG"; then
    node scripts/prepare-bundled-catalog.js "$TMP_CATALOG" || true
  else
    echo "⚠️ GitHub catalog download did not complete. Continuing with saved app data."
  fi
  rm -f "$TMP_CATALOG" 2>/dev/null || true
fi

node scripts/verify-bundled-catalog.js || true

echo "📦 Installing the locked app dependencies..."
npm install --no-audit --no-fund

if [ ! -d "ios" ]; then
  echo "📱 Creating the iOS project..."
  npx cap add ios
fi

echo "🔄 Syncing the complete app into Xcode..."
npx cap sync ios

echo "👥 Configuring SharePlay while preserving future push entitlements..."
python3 scripts/configure-shareplay-ios.py

echo "✅ Build complete. Opening Xcode..."
npx cap open ios
