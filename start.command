#!/bin/zsh
cd "$(dirname "$0")"
export PAPERLENS_HOST="${PAPERLENS_HOST:-0.0.0.0}"
export PORT="${PORT:-8788}"
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
elif [[ -x /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node ]]; then
  exec /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node server.mjs
else
  echo 'Install Node.js 20 or later, then run npm start in this folder.'
  read '?Press Enter to close.'
fi
