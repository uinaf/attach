#!/usr/bin/env bash
# Canonical local gate (same contract CI verify uses via pnpm exec vp run ready).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

pnpm exec vp run ready
printf 'ok verify\n'
