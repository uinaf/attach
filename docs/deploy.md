# Deploy

Production Worker deploys from CI, not from a laptop.

Push to `main` → `.github/workflows/main.yml` → GitHub Environment `production`
→ `apps/api/scripts/deploy.ts` (build landing assets, dry-run the Worker,
validate R2 lifecycle, D1 migrate, deploy). The dry run and lifecycle gate must
pass before production D1 is mutated.

## CD environment (`production`)

| Name                        | Kind   | Purpose                                  |
| --------------------------- | ------ | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | secret | Workers / R2 / D1                        |
| `CLOUDFLARE_ACCOUNT_ID`     | var    | Cloudflare account                       |
| `CLOUDFLARE_D1_DATABASE_ID` | var    | D1 database id                           |
| `ALLOWED_GITHUB_USER_IDS`   | var    | Comma-separated numeric GitHub user ids  |
| `ATTACH_PUBLIC_BASE`        | var    | Public origin for URLs + agent JWT `aud` |

`deploy.ts` fails closed if any are missing. It writes gitignored
`wrangler.deploy.toml`, applies migrations, then `wrangler deploy --var` for
plain-text Worker vars.

Runtime secrets stay on Cloudflare (set once, not on every CD run):
`GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, optional `AGENT_REGISTRY`.
Wrangler validates the two required GitHub App secrets before deployment.

## One-time bootstrap (self-host or new account)

Binding names live in `apps/api/wrangler.toml`. Keep deploy ids out of git.

After changing bindings or vars in `wrangler.toml`, regenerate and commit Env types:

```bash
cd apps/api && pnpm run types
# wrangler types --env-file .dev.vars.example --include-runtime=false --strict-vars=false
# → small worker-configuration.d.ts (bindings only; not the workerd runtime dump)
```

Commit that file (do not gitignore it). `ready` / CI run `pnpm --filter @uinaf/attach-api types:check`
(`wrangler types --check`) so drift fails the build; CI does not regenerate types.
Local secrets stay in gitignored `.dev.vars` (see `.dev.vars.example`).

1. Create R2 + D1 matching `wrangler.toml`; put the D1 id in
   `CLOUDFLARE_D1_DATABASE_ID` (GH env var for CD). Configure the required R2
   lifecycle below before the first CD run.
2. Create a **per-deploy** GitHub App (device flow, `read:user`, no
   Contents:write). Set `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`
   with the repo-scoped Wrangler command shown under [Runtime secrets](#runtime-secrets).
3. Bind the public hostname to the Worker after the first successful CD.
   Production disables the public `workers.dev` route.
4. Optionally set `AGENT_REGISTRY` (JSON App public keys) as a Worker secret.
5. Configure **R2 object lifecycle** so physical storage matches the ADR
   two-year TTL (application soft-delete alone does not remove R2 bytes).

### R2 lifecycle (required for TTL)

For the `attach` EU bucket, add an all-prefix
[Cloudflare R2 object lifecycle rule](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
that deletes objects **760 days after upload**:

```bash
pnpm --filter @uinaf/attach-api exec wrangler r2 bucket lifecycle add \
  attach attach-object-ttl "" --expire-days 760 --jurisdiction eu
```

The Cloudflare dashboard supports the same configuration under the bucket's
Settings → Object Lifecycle Rules. A threshold equal to or tighter than
`OBJECT_TTL_MS` (~2 years / leap-day skew) can remove still-live objects.

Verify before enabling on production:

- Rule applies to the media bucket used by the Worker (`BUCKET` binding).
- Age threshold must trail application `expires_at` (use ≥ 760 days unless you
  intentionally shorten TTL in code).
- After enablement, confirm a fresh put is not deleted early (spot-check
  object age in the bucket UI).

CD requires an enabled all-prefix age rule of at least 760 days and rejects any
other enabled delete transition that is earlier or date-based. The check fails
before D1 migration. Keep account/bucket ids out of git.

CLI against your host:

```bash
export ATTACH_GITHUB_CLIENT_ID=...
# optional: export ATTACH_API_BASE=https://your.attach.host
attach login
```

## Runtime secrets

Set required secrets from the repository root:

```bash
pnpm --filter @uinaf/attach-api exec wrangler secret put GITHUB_APP_CLIENT_ID
pnpm --filter @uinaf/attach-api exec wrangler secret put GITHUB_APP_CLIENT_SECRET
```

### Agent registry

```json
[
  {
    "app_id": "<github-app-id>",
    "slug": "<app-slug>",
    "public_keys": [{ "pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----" }]
  }
]
```

```bash
pnpm --filter @uinaf/attach-api exec wrangler secret put AGENT_REGISTRY
```

Disable an agent by updating the secret and revoking or disabling that
`app:<id>` principal in D1.

## Smoke

```bash
export ATTACH_GITHUB_CLIENT_ID=...
export ATTACH_API_BASE=https://your.attach.host
attach login
attach put ./shot.png --repo owner/repo --pr 1
```

Agent JWT enroll: `iss=attach:<app_id>`, `aud` = host of `ATTACH_PUBLIC_BASE`,
`exp` ≤ `iat + 120`, one-time `jti` → `POST /v1/enroll/agent` → use returned
`att_` key for `PUT /v1/objects`.

If `ATTACH_PUBLIC_BASE` is unset, agent enroll falls back to the published
default host (`attach.uinaf.dev`) for `aud` only; set the var for any
self-hosted hostname. Invalid values fail enroll with
`attach_public_base_invalid`.

Agent JWT `jti` claims are per-token Durable Objects (`idFromName(jti)`). A
deploy that changes that keying can reopen a short replay window for JTIs still
within `JTI_RETENTION_MS` (~180s) under the previous keying.
