#!/bin/bash
# One-command setup for the NFL bet tracker.
# Safe to run again any time (e.g. to add your API key later).
set -e
cd "$(dirname "$0")"
say()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
note() { printf "   %s\n" "$*"; }

NO_RUN=""; [ "$1" = "--no-run" ] && NO_RUN=1

say "1/4 Checking the two tools this needs (uv for Python, Node for the web app)..."
if ! command -v uv >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then note "installing uv with Homebrew..."; brew install -q uv
  else
    note "uv is missing. Install it with this one command, then re-run ./setup.sh:"
    note "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
  fi
fi
if ! command -v npm >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then note "installing Node with Homebrew..."; brew install -q node
  else
    note "Node is missing. Install it from https://nodejs.org (LTS), then re-run ./setup.sh"
    exit 1
  fi
fi
note "ok: uv $(uv --version | cut -d' ' -f2), node $(node --version)"

say "2/4 Setting up the app (first run takes a few minutes)..."
( cd api && { [ -d .venv ] || uv venv -q -p 3.12 .venv; } && uv pip install -q -e . )
( cd web && npm install --silent && npm run build --silent >/dev/null )
note "ok: backend and web app built"

say "3/4 Odds feed key..."
touch api/.env
if grep -q "^ODDS_API_KEY=..*" api/.env 2>/dev/null; then
  note "ok: a key is already saved in api/.env"
elif [ -t 0 ]; then
  note "The app needs a feed of live betting odds. The Odds API (the-odds-api.com)"
  note "gives anyone a free allowance — 500 updates a month, no credit card."
  printf "   Paste your key here (or just press Enter to use demo mode for now): "
  read -r KEY
  if [ -n "$KEY" ]; then
    printf 'ODDS_API_KEY=%s\n' "$KEY" > api/.env
    note "ok: key saved. (It stays in api/.env on this computer — it is never uploaded.)"
  else
    note "ok: demo mode — realistic fake odds. Re-run ./setup.sh any time to add a key."
  fi
else
  note "no key set - the app will run in demo mode. Re-run ./setup.sh to add one."
fi

say "4/4 Done."
if [ -n "$NO_RUN" ]; then note "Start it any time with: ./run.sh"; exit 0; fi
note "Starting the app - open  http://localhost:8000  in your browser."
note "(Stop it with Ctrl+C. Start it again any time with ./run.sh)"
exec ./run.sh
