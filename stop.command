#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  FlareBase 1-Click macOS Server Stop Utility (Double-Clickable in Finder)
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed or not found on PATH."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

node scripts/stop.js --close-self "$@"
