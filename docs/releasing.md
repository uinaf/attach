# Releasing

| Workflow                        | On push to `main`                                                          |
| ------------------------------- | -------------------------------------------------------------------------- |
| `.github/workflows/main.yml`    | verify → secret scan → Worker deploy (`production`)                        |
| `.github/workflows/release.yml` | verify → secret scan → npm + Homebrew (`release`, OIDC + `uinaf-releaser`) |

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

During semantic-release prepare, the released `apps/cli/package.json` is
committed to `main` through GitHub's API as `uinaf-releaser[bot]`. GitHub signs
that commit before semantic-release creates the tag, so the tag, immutable
GitHub Release, and npm package refer to the checked-in released version.

Install:

```sh
brew install uinaf/tap/attach
# or: npm i -g @uinaf/attach-cli
# or: gh extension install uinaf/gh-attach
```

## Homebrew

[`uinaf/homebrew-tap`](https://github.com/uinaf/homebrew-tap) publishes the
`attach` formula from the exact npm release tarball. After semantic-release
publishes a new CLI version, `release.yml` downloads that version, calculates
its SHA-256 digest, renders `Formula/attach.rb`, and commits the formula through
GitHub's signed App commit API. The tap update is idempotent on rerun.

If npm/GitHub publication succeeds but the Homebrew update fails, rerun the
failed release job. It resolves the latest immutable `cli-v*` release and
retries the idempotent formula update without publishing another version.

## Worker

Push to `main` → GitHub Environment `production` → wrangler (see [Deploy](deploy.md)).
Do not deploy the production Worker from a laptop.

## Recover the interrupted CLI 0.6.2 publication

npm rejected the self-hosted runner after semantic-release created signed
commit `7a0c78d311323ae0677389405c55f9d04c920928` and tag `cli-v0.6.2`.
The release job now uses GitHub-hosted Ubuntu because
[npm provenance requires a supported hosted runner](https://docs.npmjs.com/generating-provenance-statements/).

Dispatch `release.yml` on `main` to run its fixed recovery path. It checks out
the exact event commit and validates the signed tag, ancestry, and package
version. Only the recovery workflow, helper, test, and this document may differ
from the tag; package inputs must be unchanged. The owning verification gate
builds the package before publication.

It publishes only a missing npm version through the existing OIDC identity,
then creates only a missing GitHub Release. npm integrity must match the
verified build; npm gitHead must match the event commit. The unchanged tag
remains at the original signed version commit. Lookup failures other than
a confirmed 404 stop recovery. The existing Homebrew updater then consumes
that exact npm version and writes the formula through the signed App path.

The npm-served provenance bundle must identify the tarball's SHA-512 digest,
this repository's `release.yml`, a hosted runner, and the real dispatch event
commit on main. npm validates the signed bundle at ingestion; recovery checks
those payload claims against the package and event.
Release notes distinguish that build from the unchanged release tag. GitHub
environment variables are never overridden to pretend the workflow ran at
the old tag.

This dispatch does not run semantic-release or deploy the Worker. It never
moves tags or creates another version. A repeat dispatch at the same commit
checks the existing package against the rebuilt tarball before continuing
with the idempotent Homebrew update. Remove this one-shot dispatch path after
publication and the formula have been verified.
