#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ROOT"
if [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "The iOS target has not been generated yet. Running the full UX7.9.7 build."
  exec bash "$ROOT/BUILD_UX7.9.7_AND_OPEN_XCODE.command"
fi
npx cap sync ios
python3 scripts/configure-shareplay-ios.py
export THROUPLETEA_BUILD_NUMBER="${THROUPLETEA_BUILD_NUMBER:-3}"
export THROUPLETEA_MARKETING_VERSION="${THROUPLETEA_MARKETING_VERSION:-1.0}"
python3 scripts/configure-ios-branding.py
open -a Xcode "$ROOT/ios/App/App.xcworkspace"
