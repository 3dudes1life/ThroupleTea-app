#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec "$ROOT/BUILD_UX7.9.6_AND_OPEN_XCODE.command"
