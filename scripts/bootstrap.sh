#!/usr/bin/env bash
# Cold-start the attach workspace.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'missing: pnpm (see packageManager in package.json)\n' >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  printf 'missing: node (see .node-version)\n' >&2
  exit 1
fi

pnpm install --frozen-lockfile
printf 'ok bootstrap\n'
