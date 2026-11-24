#!/bin/bash
set -eu
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN='/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'
fi
if [[ ! -x "$NODE_BIN" ]]; then echo 'Node.js 20 or later is required.'; exit 1; fi
"$NODE_BIN" scripts/launcher-password.mjs
TUNNEL_BIN="${PAPERLENS_CLOUDFLARED:-$PWD/tools/cloudflared}"
export PORT="${PORT:-8788}"
export PAPERLENS_HOST=127.0.0.1
export PAPERLENS_TRUST_TUNNEL=1
if [[ ! -x "$TUNNEL_BIN" ]]; then
  echo "Cloudflare executable missing: $TUNNEL_BIN"
  exit 1
fi
if /usr/sbin/lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the existing app with Control+C, then run this command again."
  exit 1
fi
app_pid=''
tunnel_pid=''
cleanup() {
  trap - EXIT INT TERM HUP
  for pid in "$tunnel_pid" "$app_pid"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  done
  wait 2>/dev/null || true
  echo 'PaperLens sharing stopped.'
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
./start.command &
app_pid=$!
ready=0
for ((i=0;i<30;i++)); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    echo 'PaperLens could not start.'
    exit 1
  fi
  if curl --noproxy '*' --silent --fail --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done
if [[ "$ready" != 1 ]]; then echo 'PaperLens did not become ready.'; exit 1; fi
echo 'Share the https://...trycloudflare.com link printed below.'
echo 'Anyone with that link can access PaperLens. Keep this Terminal open; Control+C stops access for everyone.'
"$TUNNEL_BIN" tunnel --url "http://127.0.0.1:$PORT" &
tunnel_pid=$!
while kill -0 "$app_pid" 2>/dev/null && kill -0 "$tunnel_pid" 2>/dev/null; do
  sleep 1
done
echo 'The app or tunnel stopped. Closing this sharing session.'
exit 1
