#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AegisDB 1-Click macOS First-Time Setup (Double-Clickable in Finder)
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

if ! command -v node &> /dev/null; then
  echo ""
  echo "🔍 Node.js runtime not found on this Mac."
  echo "🚀 Attempting automatic installation of Node.js LTS..."
  echo ""

  if command -v brew &> /dev/null; then
    echo "📦 Found Homebrew. Installing Node.js via brew..."
    brew install node
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  else
    echo "🌐 Downloading official Node.js installer from nodejs.org..."
    TEMP_PKG="/tmp/node-install.pkg"
    curl -fsSL "https://nodejs.org/dist/v20.18.0/node-v20.18.0.pkg" -o "$TEMP_PKG"
    if [ -f "$TEMP_PKG" ]; then
      echo "📦 Opening Node.js official installer..."
      open "$TEMP_PKG"
      echo "👉 Please complete the Node.js installer window that just opened, then press any key here to continue..."
      read -n 1 -s -r
      export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    fi
  fi
fi

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required. Please install it from https://nodejs.org and re-run setup.command."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

node scripts/setup.js "$@"
