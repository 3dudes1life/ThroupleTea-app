#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
python3 scripts/update-live-data.py || echo "⚠️ Live pull failed; using saved catalog."
npx cap sync ios
python3 scripts/configure-shareplay-ios.py
npx cap open ios
