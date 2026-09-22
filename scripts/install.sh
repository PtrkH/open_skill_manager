#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm install
npm run build
echo
echo "Open Skill Manager ready."
echo "  npm run osm -- list"
echo "  npm run osm -- ui"
