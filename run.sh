#!/bin/zsh
# ./run.sh        -> API + built SPA on :8000 (scheduler on)
# ./run.sh api    -> API only with auto-reload (dev)
set -e
cd "$(dirname "$0")/api"
if [[ "$1" == "api" ]]; then
  exec .venv/bin/uvicorn nflbet.main:app --reload --port 8000
else
  exec .venv/bin/uvicorn nflbet.main:app --host 0.0.0.0 --port 8000
fi
