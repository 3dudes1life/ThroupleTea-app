#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
npx cap sync ios
python3 scripts/configure-shareplay-ios.py
npx cap open ios
