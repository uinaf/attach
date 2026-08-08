---
name: attach-cli
description: "Uploads PR and validation media to a self-hosted attach Worker via the installed attach CLI (`attach` or `gh attach`): device-flow login with ATTACH_GITHUB_CLIENT_ID, put/delete of screenshots and artifacts, preview `/p/…` or raw `/o/…` markdown embeds; or GitHub App JWT enroll then `att_` PUT for agents. Use when the user asks to attach a screenshot, upload PR media, put an image on attach.uinaf.dev (or ATTACH_API_BASE), run attach login/put/delete, use gh attach, host validation media, or enroll an App agent for attach. Do not use for Worker deploy, vault, Cloudflare ops, or inventing a second upload client."
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
path (`npm i -g @uinaf/attach-cli` or `gh extension install uinaf/gh-attach`).
Do not download installers from this skill. Do not invent curl/fetch upload
scripts.

Treat `gh attach …` as the same binary surface when the extension is installed.
Never modify `gh auth` credentials.

## Human workflow

Read [references/human.md](references/human.md) for env, credentials, and
flags. Summary:

1. Require `ATTACH_GITHUB_CLIENT_ID` (Attach App client id). Optional
   `ATTACH_API_BASE` (default `https://attach.uinaf.dev`).
2. `attach login` — device flow; stores `att_` under `~/.config/attach/`.
3. `attach put <file> [--repo owner/name] [--pr N]` — prints preview `/p/…`
   by default; `--markdown` embeds raw `/o/…`; `--json` / `--url` as needed.
4. `attach delete <url-or-key>` — then verify the object is gone
   (`curl -sI <url>` → 404/410) before reporting success.
5. `attach logout` clears stored credentials.

On missing client id, allowlist rejection, or login failure: report the blocker
and stop.

## Agent workflow (GitHub App)

When the actor is a GitHub App (not a human device login), follow
[references/agent.md](references/agent.md): short-lived JWT →
`POST /v1/enroll/agent` → use returned `att_` on `PUT /v1/objects`. Re-enroll
at most once on 401; if the principal is disabled, hard-fail.

The Worker must already list the App public key in `AGENT_REGISTRY`.

## Hard rules

- `put` / object upload accepts only `att_` keys — never GitHub tokens, PATs,
  `ghs_`, or App installation tokens (including on retry after 401).
- Never print App PEMs, device codes, or `att_` values in chat or artifacts.
- Prefer preview URLs in human replies; use `--markdown` only when the consumer
  needs a raw embed.

## Done

Stop when put succeeded with a URL, delete verified gone, or when blocked on
install, client id, allowlist, registry, or auth. Keep replies short: command
used + resulting URL or precise blocker.
