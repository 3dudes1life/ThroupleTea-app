#!/bin/bash
set -e
cd "$(dirname "$0")"

node scripts/prepare-bundled-catalog.js || true
node scripts/verify-bundled-catalog.js || true

npm install --no-audit --no-fund
npx cap sync ios
python3 scripts/configure-shareplay-ios.py
npx cap open ios
