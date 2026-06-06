#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${FLOE_API_PORT:-3011}"
DASHBOARD_PORT="${FLOE_DASHBOARD_PORT:-3012}"
API_URL="${FLOE_API_BASE_URL:-http://localhost:${API_PORT}}"
DASHBOARD_URL="${FLOE_DASHBOARD_URL:-http://localhost:${DASHBOARD_PORT}}"
API_CORS_ORIGINS="${FLOE_CORS_ORIGINS:-http://localhost:3000,http://localhost:5173,http://localhost:${DASHBOARD_PORT}}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" 2>/dev/null || true
  fi
  if [[ -n "${DASHBOARD_PID:-}" ]]; then
    kill "${DASHBOARD_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Floe hackathon demo stack..."
echo "API:   ${API_URL}"
echo "Dash:  ${DASHBOARD_URL}"
echo
echo "Primary demo path: upload -> ethsepolia mint -> provenance/explorer -> search"
echo "Press Ctrl+C to stop all services."
echo

cd "${ROOT_DIR}"

PORT="${API_PORT}" FLOE_CORS_ORIGINS="${API_CORS_ORIGINS}" npm run dev &
API_PID=$!

PORT="${DASHBOARD_PORT}" VITE_FLOE_API_URL="${API_URL}" npm run dashboard &
DASHBOARD_PID=$!

wait "${API_PID}" "${DASHBOARD_PID}"
