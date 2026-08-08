# AGENTS.md

Public attach kit for PR/validation media on Cloudflare.

## Tracker

[uinaf project board](https://github.com/orgs/uinaf/projects/1)

Keep tracker links out of package-facing docs (`README.md`).

## Orientation

| Doc                                                  | When                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| [Contributing](CONTRIBUTING.md)                      | setup, verify, PR flow                          |
| [Auth contract](docs/adr-001-auth-and-principals.md) | principals, enroll, quotas, serve/takedown      |
| [Deploy](docs/deploy.md)                             | self-host, GH/CF vs local vault, agent registry |
| [Releasing](docs/releasing.md)                       | Worker CD + npm `@uinaf/attach-cli`             |

| Path       | Role                                        |
| ---------- | ------------------------------------------- |
| `apps/api` | Worker                                      |
| `apps/cli` | npm `@uinaf/attach-cli` / `uinaf/gh-attach` |
| `apps/web` | landing (`@uinaf/design`)                   |

## Rules

- `put` accepts only `att_` keys. Never accept GitHub tokens on upload.
- Agent JWT: `iss=attach:<app_id>`, `aud` matches `ATTACH_PUBLIC_BASE` host, `exp≤120s`, DO jti.
- Quotas are per principal; re-enroll must not reset them.
- Objects: raw `/o/<key>`, preview `/p/<key>`; put returns both `url` and `preview_url`.
- Do not commit secrets, PEM private keys, account/D1 ids, or font binaries.
- Prefer vite-plus (`vp`) for check/test/build; wrangler for Worker deploy.
- Production CD reads GitHub Environment `production`; runtime secrets live on Cloudflare. Vault is local-only (see [Deploy](docs/deploy.md)).
