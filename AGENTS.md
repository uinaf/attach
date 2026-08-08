# AGENTS.md

Public attach kit for PR/validation media on Cloudflare.

## Tracker

[uinaf project board](https://github.com/orgs/uinaf/projects/1)

Keep tracker links out of package-facing docs (`README.md`).

## Orientation

| Doc                                                  | When                          |
| ---------------------------------------------------- | ----------------------------- |
| [Contributing](CONTRIBUTING.md)                      | setup, verify, PRs            |
| [Auth contract](docs/adr-001-auth-and-principals.md) | principals, enroll, quotas    |
| [Deploy](docs/deploy.md)                             | Worker CD + bootstrap         |
| [Releasing](docs/releasing.md)                       | npm CLI + Tessl skill publish |
| [attach-cli skill](skills/attach-cli/SKILL.md)       | consumer agent skill (Tessl)  |

| Path       | Role                                    |
| ---------- | --------------------------------------- |
| `apps/api` | Worker                                  |
| `apps/cli` | `@uinaf/attach-cli` / `uinaf/gh-attach` |
| `apps/web` | landing                                 |

Production Worker CD is GitHub Environment `production` only. Vault
(`shared/uinaf-attach-deploy`, workers-deploy, attach-github-app) is for local
bootstrap/break-glass inject — never document vault paths in package docs.

## Rules

- `put` accepts only `att_` keys. Never accept GitHub tokens on upload.
- Agent JWT: `iss=attach:<app_id>`, `aud` matches `ATTACH_PUBLIC_BASE` host, `exp≤120s`, DO jti.
- Quotas are per principal; re-enroll must not reset them.
- Objects: raw `/o/<key>`, preview `/p/<key>`; put returns both `url` and `preview_url`.
- Do not commit secrets, PEM private keys, account/D1 ids, or font binaries.
- Prefer repo-scoped vite-plus via `pnpm exec vp` (never a global `vp`); wrangler for Worker deploy.
- After `apps/api/wrangler.toml` binding/var changes: `pnpm --filter @uinaf/attach-api types` and commit the Env-only `worker-configuration.d.ts` (never the full runtime dump; CI checks freshness via `types:check`).
- Prod CD: GitHub Environment `production`. Runtime secrets: Cloudflare.
