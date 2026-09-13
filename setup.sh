#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  FlareBase 1-Click Fast Linux Universal Setup
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

if ! command -v node &> /dev/null; then
  echo ""
  echo "============================================================================"
  echo "  🔍 Node.js runtime not found on this Linux machine."
  echo "  🚀 Installing Node.js LTS via package manager..."
  echo "============================================================================"
  echo ""

  if command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y nodejs
  elif command -v pacman &> /dev/null; then
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v apk &> /dev/null; then
    sudo apk add --no-cache nodejs npm
  else
    echo "❌ Please install Node.js 18+ manually from https://nodejs.org"
    exit 1
  fi
fi

if ! command -v node &> /dev/null; then
  echo ""
  echo "❌ Node.js is required to run FlareBase."
  echo "   Please install Node.js 18+ from https://nodejs.org and re-run ./setup.sh."
  echo ""
  exit 1
fi

node scripts/setup.js "$@"
