# AGENTS.md

Public attach kit for PR/validation media on Cloudflare.

## Tracker

[uinaf project board](https://github.com/orgs/uinaf/projects/1)

Keep tracker links out of package-facing docs (`README.md`).

## Orientation

- Auth/upload contract: `docs/adr-001-auth-and-principals.md`
- Operator setup: `docs/dogfood.md`
- Release pipelines: `docs/releasing.md`
- Worker: `apps/api`
- CLI: `apps/cli` → npm `@uinaf/attach-cli` / `uinaf/gh-attach`
- Landing: `apps/web` (uses `@uinaf/design`)

## Rules

- `put` accepts only `att_` keys. Never accept GitHub tokens on upload.
- Agent JWT: `iss=attach:<app_id>`, `aud=attach.uinaf.dev`, `exp≤120s`, DO jti.
- Quotas are per principal; re-enroll must not reset them.
- Objects: raw `/o/<key>`, preview `/p/<key>`; put returns both `url` and `preview_url`.
- Do not commit secrets, PEM private keys, or font binaries.
- Prefer vite-plus (`vp`) for check/test/build; wrangler for Worker deploy.

## Verify

```bash
pnpm install --frozen-lockfile
pnpm exec vp run ready
```
