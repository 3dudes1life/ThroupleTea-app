#!/bin/bash
set -e
cd "$(dirname "$0")"

node scripts/prepare-bundled-catalog.js || true
node scripts/verify-bundled-catalog.js || true

RSS_FILE="$(mktemp -t throupletea-rss).xml"
if curl -fL --retry 3 --connect-timeout 20   "https://anchor.fm/s/1087008c4/podcast/rss?$(date +%s)"   -o "$RSS_FILE"; then
  python3 scripts/hydrate-episode-descriptions.py "$RSS_FILE" || true
fi
rm -f "$RSS_FILE" 2>/dev/null || true

echo "🌐 Pulling complete show notes from episode pages..."
python3 scripts/hydrate-episode-pages.py || true



node scripts/verify-rich-descriptions.js || true

npm install --no-audit --no-fund
npx cap sync ios
python3 scripts/configure-shareplay-ios.py
npx cap open ios
