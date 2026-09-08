#!/usr/bin/env bash
# Production deploy wrapper — netrichtechnologies Microsoft 365 Control Panel
# Usage: ./scripts/deploy-production.sh --docker
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node "$ROOT/scripts/deploy-production.mjs" "$@"
