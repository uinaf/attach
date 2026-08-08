# attach

Self-hosted Cloudflare kit so humans and GitHub App agents can upload PR /
validation media to R2 and get public URLs — without cookie hacks or
Contents:write tokens on the Worker.

**Host:** [attach.uinaf.dev](https://attach.uinaf.dev)  
**Tracker:** [uinaf project board](https://github.com/orgs/uinaf/projects/1)  
**Contract:** [docs/adr-001-auth-and-principals.md](docs/adr-001-auth-and-principals.md)  
**Dogfood:** [docs/dogfood.md](docs/dogfood.md)

## Layout

| Path              | Role                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `apps/api`        | Cloudflare Worker (enroll, put, get/range, delete) + D1 + DO jti + R2 |
| `apps/cli`        | `attach` / `gh attach` CLI (`login`, `put`, `delete`, `logout`)       |
| `apps/web`        | Tiny public landing (`@uinaf/design`)                                 |
| `packages/shared` | Shared constants, key/mime helpers                                    |

## Quick start (local)

```bash
pnpm install
pnpm exec vp run ready
```

## CLI

```bash
# recommended
gh extension install uinaf/gh-attach
# or: npm i -g @uinaf/attach-cli

export ATTACH_GITHUB_CLIENT_ID=...   # Attach App client id
export ATTACH_API_BASE=https://attach.uinaf.dev   # optional; production default

gh attach login
gh attach put ./shot.png --repo uinaf/foo --pr 12
# prints /p/… preview URL; --markdown embeds raw /o/…
gh attach delete <url-or-key>
```

`put` accepts GitHub tokens **never** — only `att_` keys minted at enroll.

From this repo (dev): `pnpm --filter @uinaf/attach-cli build && node apps/cli/dist/attach.mjs …`

## Auth summary

| Who   | Enroll                                                        | Upload         |
| ----- | ------------------------------------------------------------- | -------------- |
| Human | Attach App device flow → `POST /v1/enroll/human`              | `Bearer att_…` |
| Agent | JWT (`iss=attach:<app_id>`, DO jti) → `POST /v1/enroll/agent` | `Bearer att_…` |

## Deploy

GitHub Actions `production` Environment + wrangler. See [docs/dogfood.md](docs/dogfood.md).

```bash
pnpm run deploy
```
