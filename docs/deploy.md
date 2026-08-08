# Deploy

Run your own attach Worker (R2 + D1 + Durable Object). Binding names live in
`apps/api/wrangler.toml`. Keep deploy-specific ids and allowlists out of git.

## GitHub App

Create a **per-deploy** GitHub App:

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Homepage = your public attach base URL. Enable **Device Flow**.
3. OAuth scope from the CLI: `read:user`. No repository Contents:write.
4. Install on accounts that will enroll (allowlist still gates by numeric user id).
5. Copy **Client ID** and generate a **Client secret**.

```bash
cd apps/api
wrangler secret put GITHUB_APP_CLIENT_ID
wrangler secret put GITHUB_APP_CLIENT_SECRET
```

```bash
export ATTACH_GITHUB_CLIENT_ID=...   # same client id
# optional: export ATTACH_API_BASE=https://your.attach.host
attach login
```

## Cloudflare

Create resources that match `wrangler.toml`, then deploy with env set:

```bash
wrangler r2 bucket create <bucket_name>
wrangler d1 create <database_name>   # export id as CLOUDFLARE_D1_DATABASE_ID
pnpm --filter @uinaf/attach-web build
pnpm --filter @uinaf/attach-api deploy
```

`apps/api/scripts/deploy.ts` requires:

| Name                        | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | Workers / R2 / D1                       |
| `CLOUDFLARE_ACCOUNT_ID`     | Cloudflare account                      |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 database id                          |
| `ALLOWED_GITHUB_USER_IDS`   | Comma-separated numeric GitHub user ids |
| `ATTACH_PUBLIC_BASE`        | Public origin for returned object URLs  |

It writes gitignored `wrangler.deploy.toml`, applies D1 migrations, then
`wrangler deploy --var` for the plain-text Worker vars. Missing env fails closed.

Also set Worker secrets: `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, and
optionally `AGENT_REGISTRY` (below). Bind your custom hostname after the script
exists.

This repo’s CD (`main.yml`) reads the same names from GitHub Environment
`production` (`CLOUDFLARE_API_TOKEN` as a secret; the rest as vars).

## Agent registry

JSON Worker secret `AGENT_REGISTRY` (cannot also be a var):

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
