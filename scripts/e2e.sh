#!/usr/bin/env bash
# Boots the production server against the local database and runs the e2e
# suite over the mock providers. Assumes docker compose is up and seeded.
set -euo pipefail
cd "$(dirname "$0")/.."

bun run build
ATELIER_ADMIN_EMAIL="${ATELIER_ADMIN_EMAIL:-alex@atelier.local}" \
ATELIER_ADMIN_PASSWORD="${ATELIER_ADMIN_PASSWORD:-atelier-demo}" \
  bun run start &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

sleep 4
npx playwright test "$@"
