#!/usr/bin/env bash
# Production deploy wrapper — netrichtechnologies Microsoft 365 Control Panel
# Native host (no Docker). Usage: ./scripts/deploy-production.sh --check
# Full runbook: docs/DEPLOYMENT.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node "$ROOT/scripts/deploy-production.mjs" "$@"
