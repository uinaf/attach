# Releasing

## Pipelines

| Workflow                        | On push to `main`                                                               |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `.github/workflows/main.yml`    | verify → secrets → Worker deploy (`production`)                                 |
| `.github/workflows/release.yml` | verify → secrets → npm `@uinaf/attach-cli` (`release`, OIDC + `uinaf-releaser`) |

Worker deploy stays independent of npm so `attach.uinaf.dev` keeps shipping even when a release job fails. Do not make deploy `needs: [release]`.

## npm (`@uinaf/attach-cli`)

Publishes from `.github/workflows/release.yml` via npm Trusted Publishing (OIDC) and `uinaf-releaser`. The CLI pack **bundles** `@uinaf/attach-shared` — the published tarball is self-contained.

Required on the `release` GitHub Environment:

| Name                            | Kind   | Purpose                                     |
| ------------------------------- | ------ | ------------------------------------------- |
| `UINAF_RELEASE_APP_CLIENT_ID`   | var    | GitHub App client id for the releaser bot   |
| `UINAF_RELEASE_APP_PRIVATE_KEY` | secret | GitHub App private key for the releaser bot |

npm trusted publisher must be registered once (requires npm 2FA / browser OTP):

```sh
cd /tmp
npm trust github @uinaf/attach-cli \
  --file release.yml \
  --repo uinaf/attach \
  --env release \
  --allow-publish -y
```

Tags use `cli-v${version}` so they stay distinct from any future non-CLI tags.

## gh extension

Install:

```sh
gh extension install uinaf/gh-attach
gh attach login
```

The extension repo is a thin Node wrapper around the published `@uinaf/attach-cli` package (`npx`).

## Consumer install (npm)

```sh
npm i -g @uinaf/attach-cli
export ATTACH_GITHUB_CLIENT_ID=...   # Attach App client id
attach login
```
