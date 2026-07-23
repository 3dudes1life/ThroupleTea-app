#!/bin/bash
set -e
cd "$(dirname "$0")"
cp capacitor.config.live.json capacitor.config.json
npx cap sync ios
npx cap open ios
