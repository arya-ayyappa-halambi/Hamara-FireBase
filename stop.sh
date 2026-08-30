#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AegisDB 1-Click Linux / POSIX Server Stop Utility
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed or not found on PATH."
  exit 1
fi

node scripts/stop.js "$@"
