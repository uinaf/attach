# Deploy

Production Worker deploys from CI — not from a laptop.

Push to `main` → `.github/workflows/main.yml` → GitHub Environment `production`
→ `apps/api/scripts/deploy.ts` (build landing assets, D1 migrate, wrangler).

## CD environment (`production`)

| Name                        | Kind   | Purpose                                 |
| --------------------------- | ------ | --------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | secret | Workers / R2 / D1                       |
| `CLOUDFLARE_ACCOUNT_ID`     | var    | Cloudflare account                      |
| `CLOUDFLARE_D1_DATABASE_ID` | var    | D1 database id                          |
| `ALLOWED_GITHUB_USER_IDS`   | var    | Comma-separated numeric GitHub user ids |
| `ATTACH_PUBLIC_BASE`        | var    | Public origin for returned object URLs  |

`deploy.ts` fails closed if any are missing. It writes gitignored
`wrangler.deploy.toml`, applies migrations, then `wrangler deploy --var` for
plain-text Worker vars.

Runtime secrets stay on Cloudflare (set once, not on every CD run):
`GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, optional `AGENT_REGISTRY`.

## One-time bootstrap (self-host or new account)

Binding names live in `apps/api/wrangler.toml`. Keep deploy ids out of git.

1. Create R2 + D1 matching `wrangler.toml`; put the D1 id in
   `CLOUDFLARE_D1_DATABASE_ID` (GH env var for CD).
2. Create a **per-deploy** GitHub App (device flow, `read:user`, no
   Contents:write). `wrangler secret put` the App client id/secret.
3. Bind the public hostname to the Worker after the first successful CD.
4. Optionally set `AGENT_REGISTRY` (JSON App public keys) as a Worker secret.
5. Configure **R2 object lifecycle** so physical storage matches the ADR
   two-year TTL (application soft-delete alone does not remove R2 bytes).

### R2 lifecycle (required for TTL)

In the Cloudflare dashboard (or API) for the attach R2 bucket, add a lifecycle
rule that **deletes objects 730 days after upload** (or AbortIncomplete / age
equivalent). Verify before enabling on production:

- Rule applies to the media bucket used by the Worker (`BUCKET` binding).
- Age threshold ≥ application TTL (`OBJECT_TTL_MS` ≈ 2 years); tighter rules
  can delete still-live objects.
- After enablement, confirm a fresh put is not deleted early (spot-check
  object age in the bucket UI).

Document the rule name in your operator notes; keep account/bucket ids out of
git.

CLI against your host:

```bash
export ATTACH_GITHUB_CLIENT_ID=...
# optional: export ATTACH_API_BASE=https://your.attach.host
attach login
```

## Agent registry

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
wrangler secret put AGENT_REGISTRY
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
