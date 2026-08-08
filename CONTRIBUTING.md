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

Tracker: https://github.com/orgs/uinaf/projects/1

## Deploy

Worker deploys from `main` via the `production` GitHub Environment
(`attach.uinaf.dev`). See [docs/dogfood.md](docs/dogfood.md).

CLI npm publish is not wired yet — no `release` Environment until a package
publish path exists.
