# Human CLI (`attach` / `gh attach`)

## Install (user-approved only)

```bash
brew install uinaf/tap/attach
# or: npm i -g @uinaf/attach-cli
# or:
gh extension install uinaf/gh-attach
```

The skill must not fetch install scripts. After install, `attach` and
`gh attach` share the same commands.

## Environment

| Variable                  | Required | Purpose                                               |
| ------------------------- | -------- | ----------------------------------------------------- |
| `ATTACH_GITHUB_CLIENT_ID` | custom   | GitHub App client id override for a custom deployment |
| `ATTACH_API_BASE`         | no       | Worker origin; default `https://attach.uinaf.dev`     |

The hosted service bundles the public client id for the uinaf Attach GitHub
App. A self-hosted deployment must set both variables for its own Worker and
GitHub App.

## Commands

```bash
attach login [--json]
attach put <file> [--repo owner/name] [--pr N] [--dry-run] [--json|--markdown|--url]
attach delete <url-or-key> [--dry-run] [--json]
attach logout [--json]
attach help [--json]
```

- **login** — GitHub App device flow for the Attach App. Does not read or write
  `gh auth` tokens. Mints an `att_` key via `POST /v1/enroll/human`.
- **put** — uploads with stored `att_`. Default stdout is the **preview** URL
  (`/p/…`). `--markdown` embeds the **raw** object URL (`/o/…`). `--url`
  prints raw URL only; `--json` prints the API body.
- **delete** — authenticated delete by owning principal (URL or object key).
  After delete, verify with `curl -sI <url>` (expect 404 or 410) before
  reporting success.
- **logout** — removes `~/.config/attach/credentials.json` (or
  `$XDG_CONFIG_HOME/attach/credentials.json`).
- **help** — human-readable usage by default; `--json` describes commands,
  positionals, flags, types, exclusivity, and environment requirements.

## Predictable agent calls

- Parsing is strict: unknown flags, extra positionals, missing values, invalid
  `owner/name` / PR metadata, and conflicting output modes exit 2.
- `--json` returns machine-readable command results and structured errors with
  nonzero exit status. Login device-flow instructions remain on stderr.
- `put --dry-run` reads and validates the local file, reports detected type,
  size, metadata, output mode, and target origin, but does not read credentials
  or call the Worker.
- `delete --dry-run` validates the key/path/URL and target origin without
  reading credentials or calling the Worker. Dry-run does not prove auth,
  ownership, quota, or service availability.
- Full delete URLs must match the effective Attach origin and cannot contain
  credentials, query strings, fragments, control characters, encoded segments,
  or traversal-like paths.

## Credentials file

Stored at `~/.config/attach/credentials.json` (mode 0600). Contains `token`
(`att_…`), `key_id`, `principal`, `stamp`, `api_base`. Do not cat or paste it
into chat.

## Failure modes

| Symptom                                | Likely cause                          | Agent action                                    |
| -------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| missing client id with custom API base | custom App override unset             | ask operator for custom App client id           |
| enroll / allowlist error               | user not in `ALLOWED_GITHUB_USER_IDS` | stop; operator must allowlist                   |
| 401 on put after login                 | expired/revoked key                   | `attach login` once; then stop if still failing |
| command not found                      | CLI not installed                     | ask user to install; do not curl-upload         |
