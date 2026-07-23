#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "🦸 Building UX7.9.6 — Certificate-Safe Superman Build..."
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

echo "🎙️ Downloading the full podcast RSS with macOS curl..."
RSS_FILE="$(mktemp -t throupletea-rss).xml"
if curl -fL --retry 3 --connect-timeout 20   "https://anchor.fm/s/1087008c4/podcast/rss?$(date +%s)"   -o "$RSS_FILE"; then
  python3 scripts/hydrate-episode-descriptions.py "$RSS_FILE" || true
else
  echo "⚠️ RSS download failed. Preserving the richest saved episode descriptions."
fi
rm -f "$RSS_FILE" 2>/dev/null || true

echo "🌐 Pulling complete show notes from episode pages..."
python3 scripts/hydrate-episode-pages.py || true




node scripts/verify-rich-descriptions.js || true

echo "📦 Installing the locked app dependencies..."
npm install --no-audit --no-fund

echo "🧪 Testing UX7.9.6 formatter and native Episode Detail..."
npm test

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
