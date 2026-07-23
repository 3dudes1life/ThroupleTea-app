#!/bin/bash
set -e
cd "$(dirname "$0")"
npx cap sync ios
npx cap open ios
