# Human CLI (`attach` / `gh attach`)

## Install (user-approved only)

```bash
npm i -g @uinaf/attach-cli
# or
gh extension install uinaf/gh-attach
```

The skill must not fetch install scripts. After install, `attach` and
`gh attach` share the same commands.

## Environment

| Variable                  | Required    | Purpose                                           |
| ------------------------- | ----------- | ------------------------------------------------- |
| `ATTACH_GITHUB_CLIENT_ID` | yes (login) | Attach GitHub App **client id** (device flow)     |
| `ATTACH_API_BASE`         | no          | Worker origin; default `https://attach.uinaf.dev` |

## Commands

```bash
attach login
attach put <file> [--repo owner/name] [--pr N] [--json|--markdown|--url]
attach delete <url-or-key>
attach logout
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

## Credentials file

Stored at `~/.config/attach/credentials.json` (mode 0600). Contains `token`
(`att_…`), `key_id`, `principal`, `stamp`, `api_base`. Do not cat or paste it
into chat.

## Failure modes

| Symptom                           | Likely cause                          | Agent action                                    |
| --------------------------------- | ------------------------------------- | ----------------------------------------------- |
| missing `ATTACH_GITHUB_CLIENT_ID` | env unset                             | ask user for Attach App client id               |
| enroll / allowlist error          | user not in `ALLOWED_GITHUB_USER_IDS` | stop; operator must allowlist                   |
| 401 on put after login            | expired/revoked key                   | `attach login` once; then stop if still failing |
| command not found                 | CLI not installed                     | ask user to install; do not curl-upload         |
