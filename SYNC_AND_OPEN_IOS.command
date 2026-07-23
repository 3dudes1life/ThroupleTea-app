#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
exec bash "$ROOT/SYNC_AND_OPEN_XCODE.command"
