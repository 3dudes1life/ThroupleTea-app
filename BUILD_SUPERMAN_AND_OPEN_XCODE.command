#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "🦸 Building the Superman version of A Little Throuple Tea..."
echo ""

npm install

if [ ! -d "ios" ]; then
  echo "Creating the iOS project..."
  npx cap add ios
fi

echo "Syncing the complete app into Xcode..."
npx cap sync ios

echo "Opening Xcode..."
npx cap open ios
