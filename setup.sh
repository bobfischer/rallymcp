#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing dependencies…"
npm install

echo "==> Building TypeScript…"
npm run build

# First-time setup: create .env from example if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "==> Created .env from .env.example"
  echo "    Edit .env and set your RALLY_API_KEY before running the server."
else
  echo ""
  echo "==> .env already exists — skipping"
fi

echo ""
echo "✅  Setup complete. Run 'npm run dev' to start the server."
