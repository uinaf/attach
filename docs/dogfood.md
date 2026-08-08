# Dogfood setup

Operator runbook for the `attach.uinaf.dev` instance.

| Who   | Identity                                 |
| ----- | ---------------------------------------- |
| Human | `altaywtf` · GitHub user `9790196`       |
| Agent | Glitch · app id `4455325` / `glitch418x` |

## Attach GitHub App

Create a **per-deploy** GitHub App (not the multi-tenant uinaf app):

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Homepage: `https://attach.uinaf.dev`. Enable **Device Flow**.
3. Minimal OAuth scope from the CLI (`read:user`). No repository Contents:write.
4. Install on accounts that will enroll (allowlist still gates by numeric user id).
5. Copy **Client ID** and generate a **Client secret**.

Canonical secrets live in `uinaf/vault` as `shared/uinaf-attach-github-app`
(`ATTACH_GITHUB_CLIENT_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`).

Worker secrets (GitHub Environment `production` cannot use `GITHUB_*` secret names):

```bash
cd apps/api
wrangler secret put GITHUB_APP_CLIENT_ID
wrangler secret put GITHUB_APP_CLIENT_SECRET
```

CLI login with vault:

```bash
# from uinaf/vault
sops exec-env --same-process secrets/shared/uinaf-attach-github-app.sops.json -- \
  bash -lc 'cd ~/projects/uinaf/attach && attach login'
```

Actions deploy still needs `CLOUDFLARE_API_TOKEN` and variable
`CLOUDFLARE_ACCOUNT_ID=b7ef10ce7bc4d0568bf3920b52402642`.

## Agent registry (Glitch)

Export Glitch's App **public** key and set Worker secret `AGENT_REGISTRY`
(CF forbids the same name as a var + secret):

```json
[
  {
    "app_id": "4455325",
    "slug": "glitch418x",
    "public_keys": [{ "pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----" }]
  }
]
```

```bash
wrangler secret put AGENT_REGISTRY
```

To disable an agent: remove/disable the registry entry **and** redeploy; also
revoke keys for `app:4455325` (D1) or mark the principal disabled.

## Cloudflare resources

Account `b7ef10ce7bc4d0568bf3920b52402642`, zone `uinaf.dev`.

```bash
# from apps/api, with CLOUDFLARE_API_TOKEN set
wrangler r2 bucket create attach --jurisdiction eu
wrangler d1 create attach
# paste database_id into wrangler.toml
wrangler d1 migrations apply attach --remote
pnpm --filter @uinaf/attach-web build
wrangler deploy
```

Bind `attach.uinaf.dev` via `uinaf/infra` (`cloudflare_workers_custom_domain`)
once the Worker script `attach` exists.

## Human and agent smoke

```bash
export ATTACH_GITHUB_CLIENT_ID=...   # Attach App client id
export ATTACH_API_BASE=https://attach.uinaf.dev
attach login
attach put ./shot.png --repo uinaf/attach --pr 1
# preview: /p/<key> · raw: /o/<key>
```

Agent JWT enroll:

| Claim | Value              |
| ----- | ------------------ |
| `iss` | `attach:4455325`   |
| `aud` | `attach.uinaf.dev` |
| `exp` | ≤ `iat + 120`      |
| `jti` | UUID (one-time)    |

```http
POST /v1/enroll/agent
Authorization: Bearer <jwt>
```

Use the returned `att_` key for `PUT /v1/objects`. On 401, re-enroll at most
once; if the principal is disabled, hard-fail.
