#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Installing packages..."
npm install

if [ ! -d "ios" ]; then
  echo "Creating iOS project..."
  npx cap add ios
fi

echo "Switching to LIVE website mode..."
cp capacitor.config.live.json capacitor.config.json

echo "Syncing iOS..."
npx cap sync ios

echo "Opening Xcode..."
npx cap open ios
