#!/bin/bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ROOT"

printf '\n🫖 Building A Little Throuple Tea — UX7.9.6\n'
printf 'Project folder: %s\n\n' "$ROOT"

if [ ! -f ".ux796-throupletea-project" ]; then
  echo "❌ This is not the packaged UX7.9.6 project folder."
  exit 1
fi

python3 - <<'PY'
import json
from pathlib import Path

config = json.loads(Path('capacitor.config.json').read_text())
assert config.get('appId') == 'com.throupletea.app', config
assert config.get('appName') == 'A Little Throuple Tea', config
assert config.get('webDir') == 'www', config
assert not config.get('server', {}).get('url'), 'Bundled build must not use a remote server URL.'
assert Path('www/index.html').exists()
assert Path('www/app.js').exists()
print('✅ Confirmed Throuple Tea bundled-app identity.')
PY

chmod -R u+rwX .
xattr -dr com.apple.quarantine . 2>/dev/null || true

# Recover from an interrupted or unrelated iOS folder, but preserve a valid generated project.
if [ -d ios ] && [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "🧹 Removing an incomplete iOS project..."
  rm -rf ios
fi

echo "📦 Installing locked Capacitor dependencies..."
npm install --no-audit --no-fund

echo "📖 Rebuilding every native episode description from the bundled episode pages..."
python3 scripts/hydrate-episode-pages.py

echo "🧪 Running UX7.9.6 full-description regression tests..."
npm test

if [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "📱 Creating the Throuple Tea iOS project..."
  npx cap add ios
fi

echo "🔄 Syncing bundled app files into the exact iOS target..."
npx cap sync ios

if [ -f scripts/configure-shareplay-ios.py ]; then
  echo "👥 Configuring SharePlay..."
  python3 scripts/configure-shareplay-ios.py
fi

python3 - <<'PY'
import json
from pathlib import Path

root = Path('.')
config_path = root / 'ios/App/App/capacitor.config.json'
project_path = root / 'ios/App/App.xcodeproj/project.pbxproj'

if not config_path.exists() or not project_path.exists():
    raise SystemExit('❌ The expected Throuple Tea Xcode project was not generated.')

config = json.loads(config_path.read_text())
if config.get('appId') != 'com.throupletea.app':
    raise SystemExit(f"❌ Wrong native app ID: {config.get('appId')!r}")
if config.get('appName') != 'A Little Throuple Tea':
    raise SystemExit(f"❌ Wrong native app name: {config.get('appName')!r}")
if config.get('server', {}).get('url'):
    raise SystemExit('❌ Native build unexpectedly points at a remote website.')

project = project_path.read_text(errors='ignore')
if 'com.throupletea.app' not in project:
    raise SystemExit('❌ Xcode target does not contain the Throuple Tea bundle identifier.')

print('✅ Native target verified: A Little Throuple Tea / com.throupletea.app')
PY

WORKSPACE="$ROOT/ios/App/App.xcworkspace"
PROJECT="$ROOT/ios/App/App.xcodeproj"

echo "🚀 Opening only this project in Xcode..."
if [ -d "$WORKSPACE" ]; then
  open -a Xcode "$WORKSPACE"
else
  open -a Xcode "$PROJECT"
fi

printf '\n✅ In Xcode, select the App scheme and your iPhone, then press ▶︎.\n'
