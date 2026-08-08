# Contributing

## Setup

Node (see `.node-version`) with Corepack enabled:

```sh
./scripts/bootstrap.sh
# equivalent: pnpm install --frozen-lockfile && pnpm exec vp config --no-agent
```

## Validation

```sh
./scripts/verify.sh
# equivalent: pnpm run verify  →  vp run ready
```

After a local deploy attempt, clean temp config:

```sh
./scripts/teardown.sh
# removes apps/api/wrangler.deploy.toml
```

Full session shape:

```sh
set -euo pipefail
trap './scripts/teardown.sh' EXIT
./scripts/bootstrap.sh
./scripts/verify.sh
```

## Pull requests

Use squash merge. Keep PRs focused; fill out the PR template (summary, changed,
risks, verification, complexity).

## Deploy and release

- Worker CD: push to `main` → GitHub Environment `production` → wrangler. Credentials and self-host steps: [Deploy](docs/deploy.md).
- CLI npm: push to `main` → Environment `release`. [Releasing](docs/releasing.md).

Do not put deploy ids, allowlists, or tokens in git. Production never reads
`uinaf/vault` — that path is local operator inject only.
