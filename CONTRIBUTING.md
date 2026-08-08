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
```

API Worker tests: Node characterization via vite-plus, plus
`@cloudflare/vitest-pool-workers` (`pnpm --filter @uinaf/attach-api test:workers`).
After `wrangler.toml` binding changes: `pnpm --filter @uinaf/attach-api types` and commit
`apps/api/worker-configuration.d.ts` (Env bindings only). Verify runs `types:check`.

## Pull requests

Use squash merge. Keep PRs focused; fill out the PR template.

## Deploy and release

- Worker: push `main` → CD. [Deploy](docs/deploy.md)
- npm `@uinaf/attach-cli`: [Releasing](docs/releasing.md)

Do not commit deploy ids, allowlists, tokens, or PEMs.
