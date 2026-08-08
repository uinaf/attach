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

Tags use `cli-v${version}` so they stay distinct from any future non-CLI tags.

### First-time bootstrap (once)

`npm trust` only works on an **existing** package. Bootstrap order:

Bootstrap (done for `@uinaf/attach-cli@0.1.2`):

1. Manual first publish with owner login (creates the packument). Use `dist/attach.js` bins — npm strips `.mjs` bin paths.
2. Register trusted publisher:

   ```sh
   cd /tmp
   npx -y npm@^11.10.0 trust github @uinaf/attach-cli \
     --repo uinaf/attach \
     --file release.yml \
     --env release \
     --allow-publish \
     --yes
   ```

Later `main` pushes own every release via OIDC — no `NPM_TOKEN`.

## gh extension

```sh
gh extension install uinaf/gh-attach
gh attach login
```

Thin `npx` wrapper around `@uinaf/attach-cli`. If another extension already owns `gh attach`, uninstall it first or use `npm i -g @uinaf/attach-cli` → `attach …`.

## Consumer install (npm)

```sh
npm i -g @uinaf/attach-cli
export ATTACH_GITHUB_CLIENT_ID=...   # Attach App client id
attach login
```
