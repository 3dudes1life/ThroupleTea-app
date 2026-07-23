#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec "$ROOT/SYNC_AND_OPEN_XCODE.command"
