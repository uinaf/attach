#!/usr/bin/env bash
# Tear down local workspace artifacts. Safe on success, failure, or cancel.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

rm -f apps/api/wrangler.deploy.toml
printf 'ok teardown\n'
