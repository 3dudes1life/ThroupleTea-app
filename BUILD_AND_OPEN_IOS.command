#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Installing Capacitor packages..."
npm install

if [ ! -d "ios" ]; then
  echo "Creating the iOS project..."
  npx cap add ios
fi

echo "Syncing the current Throuple Tea website into iOS..."
npx cap sync ios

echo "Opening Xcode..."
npx cap open ios
