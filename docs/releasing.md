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
committed to `main` through GitHub's API as `uinaf-releaser[bot]`. The local
prepare plugin permits only the version change and atomically requires main
to match the verified event commit. If main advances before writeback,
publication stops. The checkout then uses the exact signed commit returned by
GitHub. GitHub signs
that commit before semantic-release creates the tag, so the tag, immutable
GitHub Release, and npm package refer to the checked-in released version.

If writeback succeeds but the subsequent fetch or validation fails, the signed
version commit can remain without a tag or npm publication. Inspect the exact
commit, tag, release, and registry state before recovery; do not blindly rerun
publication or move an existing tag.

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

## CLI 0.6.2 recovery completed

CLI 0.6.2 is published with verified npm provenance and an immutable GitHub
Release. The Homebrew formula consumes the same npm tarball through a signed
commit. The temporary recovery dispatch has been removed. The release tag
remains at its original signed version commit; npm provenance and gitHead
identify the recovery build on main.
