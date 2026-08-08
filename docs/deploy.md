# Deploy

Self-host an attach Worker (R2 + D1 + Durable Object) and wire a GitHub App for
human enroll. Binding names live in `apps/api/wrangler.toml`. Deploy-specific
ids and allowlists stay in your environment — not in git.

## Credential surfaces

| Surface                | Source                                                          |
| ---------------------- | --------------------------------------------------------------- |
| Production CD          | GitHub Environment `production` → `main.yml` → wrangler         |
| Production runtime     | Cloudflare Worker secrets + plain-text vars set at deploy       |
| Local operator (uinaf) | `uinaf/vault` via `sops exec-env` only — never CI or the Worker |

## GitHub App

Create a **per-deploy** GitHub App (not a shared multi-tenant app):

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Set the homepage to your public attach base URL. Enable **Device Flow**.
3. Minimal OAuth scope from the CLI (`read:user`). No repository Contents:write.
4. Install on accounts that will enroll (allowlist still gates by numeric user id).
5. Copy **Client ID** and generate a **Client secret**.

Put App credentials on the Worker (GitHub Environment `production` cannot use
`GITHUB_*` secret names):

```bash
cd apps/api
wrangler secret put GITHUB_APP_CLIENT_ID
wrangler secret put GITHUB_APP_CLIENT_SECRET
```

CLI login needs the same client id:

```bash
export ATTACH_GITHUB_CLIENT_ID=...   # Attach App client id
# optional: export ATTACH_API_BASE=https://your.attach.host
attach login
```

## Production CD (GitHub Environment `production`)

| Name                        | Kind   | Purpose                                     |
| --------------------------- | ------ | ------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | secret | Workers / R2 / D1 token                     |
| `CLOUDFLARE_ACCOUNT_ID`     | var    | Cloudflare account                          |
| `CLOUDFLARE_D1_DATABASE_ID` | var    | D1 database id (patched into wrangler.toml) |
| `ALLOWED_GITHUB_USER_IDS`   | var    | Comma-separated numeric GitHub user ids     |
| `ATTACH_PUBLIC_BASE`        | var    | Public origin used in returned object URLs  |

`apps/api/scripts/deploy.mjs` writes gitignored `wrangler.deploy.toml` with the
D1 id, applies migrations, then `wrangler deploy --var` for the plain-text
Worker vars. Missing env fails closed.

## Production runtime (Cloudflare)

Worker secrets: `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
`AGENT_REGISTRY`.

Plain-text vars from the last deploy: `ALLOWED_GITHUB_USER_IDS`,
`ATTACH_PUBLIC_BASE`.

## Local deploy (uinaf operators)

Optional inject from vault — local machines only:

| Payload                                  | Keys                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `shared/uinaf-cloudflare-workers-deploy` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_TOKEN_ID`    |
| `shared/uinaf-attach-deploy`             | `CLOUDFLARE_D1_DATABASE_ID`, `ALLOWED_GITHUB_USER_IDS`, `ATTACH_PUBLIC_BASE`  |
| `shared/uinaf-attach-github-app`         | `ATTACH_GITHUB_CLIENT_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` |

```bash
# from uinaf/vault — command is one argument to sops exec-env
sops exec-env secrets/shared/uinaf-cloudflare-workers-deploy.sops.json \
  "sops exec-env secrets/shared/uinaf-attach-deploy.sops.json \"bash -lc 'cd ../attach && pnpm run deploy'\""
```

Self-hosters without vault: export the same names from your own secret store,
then `pnpm run deploy`.

## Cloudflare bindings

From `apps/api`, create resources that match `wrangler.toml`:

```bash
wrangler r2 bucket create <bucket_name>   # match [[r2_buckets]]
wrangler d1 create <database_name>        # note the database id for CLOUDFLARE_D1_DATABASE_ID
pnpm --filter @uinaf/attach-web build
pnpm --filter @uinaf/attach-api deploy
```

Bind your custom hostname to the Worker after the script exists.

## Agent registry

Export each agent's App **public** key and set Worker secret `AGENT_REGISTRY`
(Cloudflare forbids the same name as a var + secret):

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

To disable an agent: remove or disable the registry entry and update the secret;
also revoke keys for that `app:<id>` principal in D1 (or mark the principal
disabled).

## Smoke

```bash
export ATTACH_GITHUB_CLIENT_ID=...
export ATTACH_API_BASE=https://your.attach.host
attach login
attach put ./shot.png --repo owner/repo --pr 1
# preview: /p/<key> · raw: /o/<key>
```

Agent JWT enroll:

| Claim | Value                              |
| ----- | ---------------------------------- |
| `iss` | `attach:<github-app-id>`           |
| `aud` | host matching `ATTACH_PUBLIC_BASE` |
| `exp` | ≤ `iat + 120`                      |
| `jti` | UUID (one-time)                    |

```http
POST /v1/enroll/agent
Authorization: Bearer <jwt>
```

Use the returned `att_` key for `PUT /v1/objects`. On 401, re-enroll at most
once; if the principal is disabled, hard-fail.
