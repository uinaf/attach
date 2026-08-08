# Contributing

## Setup

Node (see `.node-version`) with Corepack enabled:

```sh
./scripts/bootstrap.sh
# equivalent: pnpm install --frozen-lockfile
# (package.json prepare runs vp config --no-agent)
```

## Validation

```sh
./scripts/verify.sh
# equivalent: pnpm run verify → vp run ready
```

```sh
./scripts/teardown.sh   # removes apps/api/wrangler.deploy.toml
```

## Pull requests

Use squash merge. Keep PRs focused; fill out the PR template.

## Deploy and release

- Self-host and Worker CD env: [Deploy](docs/deploy.md)
- npm `@uinaf/attach-cli`: [Releasing](docs/releasing.md)

Do not commit deploy ids, allowlists, tokens, or PEMs.
