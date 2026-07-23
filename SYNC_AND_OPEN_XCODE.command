#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ROOT"

if [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "The iOS target has not been generated yet. Running the full UX7.9.6 build."
  exec "$ROOT/BUILD_UX7.9.6_AND_OPEN_XCODE.command"
fi

npx cap sync ios
python3 scripts/configure-shareplay-ios.py
open -a Xcode "$ROOT/ios/App/App.xcworkspace"
