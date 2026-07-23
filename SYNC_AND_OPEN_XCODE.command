#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
npx cap sync ios
npx cap open ios
