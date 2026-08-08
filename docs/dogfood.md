# Dogfood setup

Day-one principals:

| Who   | Identity                                   |
| ----- | ------------------------------------------ |
| Human | `altaywtf` GitHub user id `9790196`        |
| Agent | Glitch app id `4455325`, slug `glitch418x` |

## 1. Create the Attach GitHub App

Create a **per-deploy** GitHub App (not the multi-tenant uinaf app):

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Name: e.g. `uinaf-attach` (or `attach-dogfood`).
3. Homepage URL: `https://attach.uinaf.dev`
4. Callback URL: not required for device flow; you can leave a placeholder.
5. **Device Flow**: enable.
6. Permissions: account `Read-only` for email is unnecessary; request minimal
   `read:user` via OAuth scope from the CLI. No repository Contents:write.
7. Install on the personal account / orgs that will enroll (allowlist still
   gates by numeric user id).
8. Copy **Client ID**. Generate a **Client secret**.
9. Optional: generate an App private key only if you also enroll agents through
   this App (Glitch uses its own App PEM).

Store secrets outside git:

```bash
cd apps/api
wrangler secret put GITHUB_APP_CLIENT_ID
wrangler secret put GITHUB_APP_CLIENT_SECRET
```

GitHub Environment `production` should hold the same for Actions deploy, plus
`CLOUDFLARE_API_TOKEN`. Set variable `CLOUDFLARE_ACCOUNT_ID=b7ef10ce7bc4d0568bf3920b52402642`.

The deploy token must allow **Workers Scripts Edit** and **D1 Edit** on this
account (`wrangler d1 migrations apply … --remote` runs before every deploy).
The shared `uinaf-cloudflare-workers-deploy` vault token is Workers-only today;
until it gains D1 Edit, attach production may use a broader account token.

## 2. Pin Glitch agent public key

Export Glitch's App **public** key (from the PEM already used by Glitch):

```bash
openssl rsa -in glitch-app.pem -pubout -out glitch-app.pub.pem
```

Set Worker var/secret `AGENT_REGISTRY` to JSON (public keys are not secret, but
wrapping as a secret avoids wrangler.toml churn):

```json
[
  {
    "app_id": "4455325",
    "slug": "glitch418x",
    "public_keys": [
      {
        "pem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
      }
    ]
  }
]
```

```bash
wrangler secret put AGENT_REGISTRY
```

To disable an agent: remove/disable the registry entry **and** redeploy; also
bulk-revoke keys for `app:4455325` (D1) or mark the principal disabled.

## 3. Cloudflare resources

Account `b7ef10ce7bc4d0568bf3920b52402642`, zone `uinaf.dev`
(`b6d4fec1c49614002fc5587a4d23e14e`).

```bash
# from apps/api, with CLOUDFLARE_API_TOKEN set
wrangler r2 bucket create attach --jurisdiction eu
wrangler d1 create attach
# paste database_id into wrangler.toml
wrangler d1 migrations apply attach --remote
pnpm --filter @uinaf/attach-web build
wrangler deploy
```

Bind `attach.uinaf.dev` via Cloudflare API / `uinaf/infra` inventory
(`cloudflare_workers_custom_domain`) once the Worker script `attach` exists —
same pattern as `design.uinaf.dev`.

## 4. Human dogfood

```bash
export ATTACH_GITHUB_CLIENT_ID=Iv1...   # from Attach App
export ATTACH_API_BASE=https://attach.uinaf.dev
pnpm --filter @uinaf/attach-cli build
node apps/cli/dist/attach.js login
node apps/cli/dist/attach.js put ./shot.png --repo uinaf/attach --pr 1
```

Or as a gh extension (after packaging): `gh attach login`.

## 5. Agent dogfood (Glitch)

Glitch signs a JWT with its App PEM:

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

Store the returned `att_` key; use it for `PUT /v1/objects`. On 401, re-enroll
at most once; if the principal is disabled, hard-fail.

## Remaining human steps

- [ ] Create Attach GitHub App and enable device flow
- [ ] Put client id/secret into wrangler secrets + GHA `production`
- [ ] Export Glitch App public key into `AGENT_REGISTRY`
- [ ] Confirm `attach.uinaf.dev` custom domain inventory import is empty-plan clean
