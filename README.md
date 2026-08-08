![attach — self-hosted Cloudflare kit for PR and validation media.](https://uinaf.dev/og/banner/attach.png)

# attach

Self-hosted Cloudflare kit so humans and GitHub App agents can upload PR /
validation media to R2 and get public URLs — without cookie hacks or
Contents:write tokens on the Worker.

Host: [attach.uinaf.dev](https://attach.uinaf.dev)

## Install

```bash
npm i -g @uinaf/attach-cli
# or: gh extension install uinaf/gh-attach
```

## Usage

```bash
export ATTACH_GITHUB_CLIENT_ID=...   # Attach GitHub App client id
# optional: export ATTACH_API_BASE=https://attach.uinaf.dev

attach login
attach put ./shot.png --repo uinaf/foo --pr 12
# prints /p/… preview URL; --markdown embeds raw /o/…
attach delete <url-or-key>
```

`put` accepts GitHub tokens **never** — only `att_` keys minted at enroll.

| Who   | Enroll                                                        | Upload         |
| ----- | ------------------------------------------------------------- | -------------- |
| Human | Attach App device flow → `POST /v1/enroll/human`              | `Bearer att_…` |
| Agent | JWT (`iss=attach:<app_id>`, DO jti) → `POST /v1/enroll/agent` | `Bearer att_…` |

## Docs

- [Auth contract](docs/adr-001-auth-and-principals.md) — principals, enroll, quotas, serve/takedown
- [Dogfood setup](docs/dogfood.md) — Attach App, secrets, agent registry
- [Releasing](docs/releasing.md) — Worker deploy + npm `@uinaf/attach-cli`

## Contributing

See [Contributing](CONTRIBUTING.md). Local verify:

```bash
pnpm install --frozen-lockfile
pnpm exec vp run ready
```
