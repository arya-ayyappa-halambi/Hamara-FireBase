#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AegisDB 1-Click Linux / POSIX First-Time Setup
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

if ! command -v node &> /dev/null; then
  echo ""
  echo "============================================================"
  echo "  Node.js runtime not found on this Linux machine."
  echo "  Attempting automatic installation of Node.js LTS..."
  echo "============================================================"
  echo ""

  if command -v apt-get &> /dev/null; then
    echo "📦 Detected Debian/Ubuntu. Installing Node.js via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &> /dev/null; then
    echo "📦 Detected Fedora/RHEL. Installing Node.js..."
    sudo dnf install -y nodejs
  elif command -v pacman &> /dev/null; then
    echo "📦 Detected Arch Linux. Installing Node.js..."
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v apk &> /dev/null; then
    echo "📦 Detected Alpine Linux. Installing Node.js..."
    sudo apk add --no-cache nodejs npm
  else
    echo "❌ Could not determine package manager. Please install Node.js manually from https://nodejs.org"
    exit 1
  fi
fi

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required. Please install Node.js 18+ from https://nodejs.org and re-run ./setup.sh."
  exit 1
fi

node scripts/setup.js "$@"
