![attach — self-hosted Cloudflare kit for PR and validation media.](https://uinaf.dev/og/banner/attach.png)

# attach

Upload PR and validation media to your own Cloudflare Worker + R2. Humans and
GitHub App agents get public URLs — no cookie hacks, no Contents:write on the
Worker.

Hosted demo: [attach.uinaf.dev](https://attach.uinaf.dev)

## Install

```bash
npm i -g @uinaf/attach-cli
# or: gh extension install uinaf/gh-attach
```

## Usage

```bash
export ATTACH_GITHUB_CLIENT_ID=...   # your Attach GitHub App client id
# optional: export ATTACH_API_BASE=https://your.attach.host

attach login
attach put ./shot.png --repo owner/repo --pr 12
attach delete <url-or-key>
```

`put` prints a `/p/…` preview URL (`--markdown` embeds raw `/o/…`). Upload auth
is `att_` keys only — never GitHub tokens.

## Docs

- [Auth contract](docs/adr-001-auth-and-principals.md)
- [Deploy (CD + bootstrap)](docs/deploy.md)
- [Releasing](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)
