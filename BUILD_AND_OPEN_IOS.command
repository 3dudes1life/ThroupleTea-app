#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec bash "$ROOT/BUILD_UX7.9.7_AND_OPEN_XCODE.command"
