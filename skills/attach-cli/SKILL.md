---
name: attach-cli
description: "Upload, share, or take down PR and validation media (screenshots, artifacts) on a self-hosted attach Worker through the installed attach CLI (`attach` or `gh attach`), or enroll a GitHub App agent for `att_` uploads. Use for any request to attach, upload, host, get a URL for, or delete media on attach.uinaf.dev (or a custom ATTACH_API_BASE), and for attach login/logout. Do not use for Worker deploy, vault, Cloudflare ops, or building another upload client."
---

# attach-cli

Upload media to an attach Worker and return public URLs. Prefer the installed
CLI for humans; use JWT enroll only for GitHub App agents.

## Require the CLI (humans)

```bash
command -v attach || command -v gh
attach --help 2>/dev/null || gh attach --help 2>/dev/null || true
```

If `attach` is missing, stop and ask the user to install via their approved
path (`brew install uinaf/tap/attach`, `npm i -g @uinaf/attach-cli`, or
`gh extension install uinaf/gh-attach`).
Do not download installers from this skill. Do not invent curl/fetch upload
scripts. Treat `gh attach …` as the same binary; never modify `gh auth`.

## Human workflow

Details: [references/human.md](references/human.md).

The hosted `https://attach.uinaf.dev` service has its public GitHub App client
id bundled, so `attach login` needs no environment setup. For a custom
`ATTACH_API_BASE`, require the deployment's own `ATTACH_GITHUB_CLIENT_ID`
(GitHub App settings); stop and ask only when that custom override is missing.

1. `attach login`
   - When the CLI emits a verification URL and device code, immediately relay
     both to the intended user and keep the login process running while they
     authorize. The short-lived code is required to cross a headless boundary.
2. `attach put <file> [--repo owner/name] [--pr N]`: default preview `/p/…`;
   `--url` for raw `/o/…`, `--markdown` for an embed, `--json` for the API body;
   add `--dry-run` to validate locally without credentials or a network request
3. `attach delete <url-or-key>` then `curl -sI <url>` → 404/410 before success
4. `attach logout` when done with credentials

Use `attach help --json` for the machine-readable command contract. Add
`--json` to commands when structured results and errors are required. Use
`attach delete <url-or-key> --dry-run` to validate and normalize a delete
target before acting.

On allowlist rejection or login failure: report the blocker and stop.

## Agent workflow (GitHub App)

JWT claims, header-file HTTP, and secret handling:
[references/agent.md](references/agent.md). Requires App **public** key in Worker
`AGENT_REGISTRY`; App PEM stays in the agent secret store (never chat).

1. Sign JWT: `iss=attach:<app_id>`, `aud` = public host, `exp≤120s`, fresh `jti`
2. `POST /v1/enroll/agent` with Authorization via a **header file** (never argv);
   parse JSON in-process; keep `token` only in memory / secret store
3. `PUT /v1/objects` the same way; success only when JSON includes both `url`
   and `preview_url`
4. On put **401**: re-enroll once (new `jti`) and put again; further failure → hard-fail

## Hard rules

- Upload only with `att_` keys, never GitHub tokens / PATs / `ghs_` / install tokens
- Relay a login device code only to the intended user during its active flow;
  never put it in logs, issues, commits, PRs, or other public/durable artifacts
- Never print App PEMs or `att_` values (including enroll JSON)
- Prefer preview URLs; `--markdown` / raw `url` only when the consumer needs embeds

Stop when put returned URLs, delete is verified gone, or you are blocked on
install, custom client id, allowlist, registry, or auth. Report the resulting
URL or the exact blocker.
