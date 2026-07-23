#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "📡 Refreshing live content..."
python3 scripts/update-live-data.py || echo "⚠️ A live source failed; preserving saved content."
python3 scripts/verify-bundled-catalog.py

echo "📦 Respecting the existing package lock..."
npm install --no-audit --no-fund

npx cap sync ios
python3 scripts/configure-shareplay-ios.py
npx cap open ios
