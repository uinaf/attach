![attach — self-hosted Cloudflare kit for PR and validation media.](https://uinaf.dev/og/banner/attach.png)

# attach

Upload PR and validation media to your own Cloudflare Worker + R2. Humans and
GitHub App agents get public URLs — no cookie hacks, no Contents:write on the
Worker.

Hosted demo: [attach.uinaf.dev](https://attach.uinaf.dev)

## Install

```bash
brew install uinaf/tap/attach
# or: npm i -g @uinaf/attach-cli
# or: gh extension install uinaf/gh-attach
```

## Usage

```bash
attach login
attach put ./shot.png --repo owner/repo --pr 12
attach delete <url-or-key>
```

`put` prints a `/p/…` preview URL (`--markdown` embeds raw `/o/…`). Upload auth
is `att_` keys only — never GitHub tokens.

The hosted `https://attach.uinaf.dev` service uses the bundled public client id
for the uinaf Attach GitHub App. Self-hosted deployments set both
`ATTACH_API_BASE` and `ATTACH_GITHUB_CLIENT_ID` for their own App.
On headless hosts, relay the verification URL and short-lived device code from
`attach login` to the intended user, then leave the process running while they
authorize. Do not copy the code into logs, issues, commits, or PRs.

## Docs

- [Auth contract](docs/adr-001-auth-and-principals.md)
- [Deployment and bootstrap](docs/deploy.md)
- [Release workflow](docs/releasing.md)
- [attach-cli skill](skills/attach-cli/SKILL.md) — agent skill for CLI / `gh attach`

## Contributing

See [Contributing](CONTRIBUTING.md) for setup, validation, and pull request
expectations.

## License

[MIT](LICENSE)
