#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "🦸 Building UX7.6 — Superman Stability Pass..."
echo ""

echo "📡 Refreshing podcast, website and full YouTube catalog..."
python3 scripts/update-live-data.py || echo "⚠️ A live source failed; the updater preserved the latest saved data."

python3 scripts/verify-bundled-catalog.py

echo "📦 Installing the exact locked app dependencies..."
npm install --no-audit --no-fund

if [ ! -d "ios" ]; then
  echo "Creating the iOS project..."
  npx cap add ios
fi

echo "Syncing the complete app into Xcode..."
npx cap sync ios

echo "Configuring native SharePlay without deleting future push entitlements..."
python3 scripts/configure-shareplay-ios.py

echo "Opening Xcode..."
npx cap open ios
