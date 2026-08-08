# Contributing

## Setup

Node (see `.node-version`) with Corepack enabled. Then:

```sh
pnpm install --frozen-lockfile
pnpm exec vp config --no-agent
```

## Validation

```sh
pnpm run verify
```

## Pull requests

Use squash merge. Keep PRs focused; fill out the PR template (summary, changed,
risks, verification, complexity).

## Deploy and release

- Worker: `main` → `production` Environment → `attach.uinaf.dev`. See [Dogfood setup](docs/dogfood.md).
- CLI npm: `main` → `release` Environment. See [Releasing](docs/releasing.md).
