#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  AegisDB 1-Click Fast macOS Setup (Double-Clickable in Finder)
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST="$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)"
  if [ -n "$NVM_LATEST" ]; then
    export PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
  fi
fi

if ! command -v node &> /dev/null; then
  echo ""
  echo "============================================================================"
  echo "  🔍 Node.js runtime not found on this Mac."
  echo "  🚀 Auto-installing Node.js LTS (please wait)..."
  echo "============================================================================"
  echo ""

  if command -v brew &> /dev/null; then
    echo "📦 Installing Node.js via Homebrew..."
    brew install --quiet node
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  else
    echo "🌐 Downloading official Node.js installer from nodejs.org..."
    TEMP_PKG="/tmp/node-v20-install.pkg"
    curl -fsSL "https://nodejs.org/dist/v20.18.0/node-v20.18.0.pkg" -o "$TEMP_PKG"
    if [ -f "$TEMP_PKG" ]; then
      echo "📦 Opening Node.js installer wizard..."
      open "$TEMP_PKG"
      echo ""
      echo "👉 Complete the installer window, then press any key here to continue..."
      read -n 1 -s -r
      export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    fi
  fi
fi

if ! command -v node &> /dev/null; then
  echo ""
  echo "❌ Node.js is required to run AegisDB."
  echo "   Please install it from https://nodejs.org and re-run setup.command."
  echo ""
  read -n 1 -s -r -p "Press any key to close this window..."
  exit 1
fi

node scripts/setup.js "$@"
SETUP_EXIT=$?

if [ $SETUP_EXIT -ne 0 ]; then
  echo ""
  echo "⚠️ Setup exited with code $SETUP_EXIT."
  read -n 1 -s -r -p "Press any key to close this window..."
fi
