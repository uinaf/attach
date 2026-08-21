# Contributing

## Setup

Node (see `.node-version`) with Corepack enabled:

```sh
./scripts/bootstrap.sh
# equivalent: pnpm install --frozen-lockfile
# (package.json prepare runs pnpm's local vp config --no-agent)
```

## Validation

```sh
./scripts/verify.sh
# equivalent: pnpm run verify → pnpm exec vp run ready
# force every lane: pnpm exec vp run --no-cache ready
```

The repository-owned Vite Task graph runs formatting, linting, design checks,
generated-type freshness, tests, and builds in parallel. Valid unchanged lanes
are restored from the task cache; the forced command bypasses it.

API Worker tests: Node characterization via vite-plus, plus
`@cloudflare/vitest-pool-workers` (`pnpm --filter @uinaf/attach-api test:workers`).
After `wrangler.toml` binding changes:
`pnpm --filter @uinaf/attach-api types`, then commit
`apps/api/worker-configuration.d.ts` (Env bindings only). Verify runs
`types:check`.

## Pull request expectations

Use squash merge. Keep PRs focused; fill out the PR template.

## Deploy and release

- Worker: push `main` → CD. [Deploy](docs/deploy.md)
- npm `@uinaf/attach-cli`: [Releasing](docs/releasing.md)

Do not commit deploy ids, allowlists, tokens, or PEMs.
