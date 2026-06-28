#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEBUG_SERVER_SCRIPT="/home/corvo/.trae/builtin_skills/TRAE-debugger/tools/debug-server/python/debug-server.py"

is_truthy() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

DEBUG_PID=""
cleanup() {
  if [[ -n "$DEBUG_PID" ]]; then
    kill "$DEBUG_PID" >/dev/null 2>&1 || true
  fi
}

if is_truthy "${TRAE_LOCAL_DEBUG:-0}"; then
  SESSION_ID="${TRAE_DEBUG_SESSION_ID:-local-dev-debug}"
  DEBUG_OUTDIR="${TRAE_DEBUG_OUTDIR:-$ROOT_DIR/.dbg}"
  DEBUG_IDLE_SECONDS="${TRAE_DEBUG_IDLE_SECONDS:-0}"
  DEBUG_PORT="${TRAE_DEBUG_PORT:-7777}"

  mkdir -p "$DEBUG_OUTDIR"

  DEBUG_ARGS=(--session "$SESSION_ID" --outdir "$DEBUG_OUTDIR" --clean --port "$DEBUG_PORT")
  if [[ "$DEBUG_IDLE_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
    DEBUG_ARGS+=(--idle "$DEBUG_IDLE_SECONDS")
  fi
  if is_truthy "${TRAE_DEBUG_REMOTE:-0}"; then
    DEBUG_ARGS+=(--remote)
  fi

  echo "[local-debug] starting Debug Server..."
  python3 "$DEBUG_SERVER_SCRIPT" "${DEBUG_ARGS[@]}" &
  DEBUG_PID=$!
  trap cleanup EXIT INT TERM
fi

cd "$ROOT_DIR"
exec vite "$@"
