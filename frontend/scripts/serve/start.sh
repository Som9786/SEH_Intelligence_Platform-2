#!/bin/sh
# Starts the SEH Intelligence Platform from this folder. Requires Node.js 18 or later.
# Extra arguments are passed on, e.g.  ./start.sh --port 9000 --host 0.0.0.0
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 18 or later from https://nodejs.org and try again."
  exit 1
fi
exec node "$(dirname "$0")/serve.mjs" "$@"
