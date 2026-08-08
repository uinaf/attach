# Releasing

| Workflow                        | On push to `main`                                                               |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `.github/workflows/main.yml`    | verify → secrets → Worker deploy (`production`)                                 |
| `.github/workflows/release.yml` | verify → secrets → npm `@uinaf/attach-cli` (`release`, OIDC + `uinaf-releaser`) |

Worker deploy stays independent of npm. Do not make deploy `needs: [release]`.

## npm (`@uinaf/attach-cli`)

Publishes from `release.yml` via npm Trusted Publishing (OIDC). The CLI pack
**bundles** `@uinaf/attach-shared` (self-contained tarball). Bin entry is
`dist/attach.js` (pack emits `.js` for the npm bin field).

`release` Environment:

| Name                            | Kind   | Purpose                      |
| ------------------------------- | ------ | ---------------------------- |
| `UINAF_RELEASE_APP_CLIENT_ID`   | var    | `uinaf-releaser` client id   |
| `UINAF_RELEASE_APP_PRIVATE_KEY` | secret | `uinaf-releaser` private key |

Tags: `cli-v${version}`. Trusted publisher: workflow `release.yml`, environment
`release`.

Install:

```sh
npm i -g @uinaf/attach-cli
# or: gh extension install uinaf/gh-attach
```

## Worker

Push to `main` → GitHub Environment `production` → wrangler (see [Deploy](deploy.md)).
Do not deploy the production Worker from a laptop.
