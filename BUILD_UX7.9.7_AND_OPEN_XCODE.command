#!/bin/bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$ROOT"

printf '\n🫖 Building Throuple Tea — UX7.9.7 / TestFlight Build %s\n' "${THROUPLETEA_BUILD_NUMBER:-3}"
printf 'Project folder: %s\n\n' "$ROOT"

if [ ! -f ".ux797-throupletea-project" ]; then
  echo "❌ This is not the packaged UX7.9.7 project folder."
  exit 1
fi

python3 - <<'PY'
import json
from pathlib import Path
config = json.loads(Path('capacitor.config.json').read_text())
assert config.get('appId') == 'com.throupletea.app', config
assert config.get('appName') == 'Throuple Tea', config
assert config.get('webDir') == 'www', config
assert not config.get('server', {}).get('url'), 'Bundled build must not use a remote server URL.'
for required in (
    'www/index.html',
    'www/app.js',
    'resources/ios/AppIcon.appiconset/Contents.json',
    'resources/ios/SplashPortrait.imageset/SplashPortrait.png',
    'plugins/throuple-watch-party/ios/Sources/ThroupleWatchPartyPlugin/ThroupleWatchPartyPlugin.swift',
):
    assert Path(required).exists(), required
print('✅ Confirmed the branded Throuple Tea bundled-app identity.')
PY

chmod -R u+rwX .
xattr -dr com.apple.quarantine . 2>/dev/null || true

if [ -d ios ] && [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "🧹 Removing an incomplete iOS project..."
  rm -rf ios
fi

echo "📦 Installing locked Capacitor dependencies..."
npm install --no-audit --no-fund

echo "📖 Rebuilding every native episode description from the bundled episode pages..."
python3 scripts/hydrate-episode-pages.py

echo "🧪 Running UX7.9.7 regression tests..."
npm test

if [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "📱 Creating the Throuple Tea iOS project..."
  npx cap add ios
fi

echo "🔄 Syncing bundled app files and the Watch Party plugin into iOS..."
npx cap sync ios

echo "👥 Configuring native SharePlay / Group Activities..."
python3 scripts/configure-shareplay-ios.py

echo "🎨 Installing the Throuple Tea icon, splash screen, display name, and build number..."
export THROUPLETEA_BUILD_NUMBER="${THROUPLETEA_BUILD_NUMBER:-3}"
export THROUPLETEA_MARKETING_VERSION="${THROUPLETEA_MARKETING_VERSION:-1.0}"
python3 scripts/configure-ios-branding.py

python3 - <<'PY'
import json
import plistlib
from pathlib import Path
root = Path('.')
config_path = root / 'ios/App/App/capacitor.config.json'
project_path = root / 'ios/App/App.xcodeproj/project.pbxproj'
info_path = root / 'ios/App/App/Info.plist'
entitlements_path = root / 'ios/App/App/App.entitlements'
for p in (config_path, project_path, info_path, entitlements_path):
    if not p.exists():
        raise SystemExit(f'❌ Expected native file was not generated: {p}')
config = json.loads(config_path.read_text())
if config.get('appId') != 'com.throupletea.app':
    raise SystemExit(f"❌ Wrong native app ID: {config.get('appId')!r}")
if config.get('appName') != 'Throuple Tea':
    raise SystemExit(f"❌ Wrong native app name: {config.get('appName')!r}")
if config.get('server', {}).get('url'):
    raise SystemExit('❌ Native build unexpectedly points at a remote website.')
with info_path.open('rb') as f:
    info = plistlib.load(f)
if info.get('CFBundleDisplayName') != 'Throuple Tea':
    raise SystemExit('❌ Native Home Screen name is not Throuple Tea.')
with entitlements_path.open('rb') as f:
    entitlements = plistlib.load(f)
if entitlements.get('com.apple.developer.group-session') is not True:
    raise SystemExit('❌ Group Activities entitlement is missing.')
project = project_path.read_text(errors='ignore')
for expected in ('com.throupletea.app', 'com.apple.GroupActivities', 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;'):
    if expected not in project:
        raise SystemExit(f'❌ Native project is missing: {expected}')
for expected in (
    root / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-AppStore-1024.png',
    root / 'ios/App/App/Assets.xcassets/SplashPortrait.imageset/SplashPortrait.png',
):
    if not expected.exists():
        raise SystemExit(f'❌ Native branding asset is missing: {expected}')
print('✅ Native target verified: Throuple Tea / com.throupletea.app')
print('✅ Watch Party entitlement and native bridge are packaged.')
print('✅ Branded icon and splash screen are packaged.')
PY

WORKSPACE="$ROOT/ios/App/App.xcworkspace"
PROJECT="$ROOT/ios/App/App.xcodeproj"

echo "🚀 Opening only this UX7.9.7 project in Xcode..."
if [ -d "$WORKSPACE" ]; then
  open -a Xcode "$WORKSPACE"
else
  open -a Xcode "$PROJECT"
fi

printf '\n✅ In Xcode: choose your iPhone, test Watch Party, then archive Build %s.\n' "$THROUPLETEA_BUILD_NUMBER"
