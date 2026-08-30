#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AegisDB 1-Click Linux / POSIX Launcher
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed or not found on PATH."
  echo "   Please install Node.js from https://nodejs.org or your package manager."
  exit 1
fi

node scripts/serve.js "$@"
