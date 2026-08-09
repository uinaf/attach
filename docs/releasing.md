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

## Tessl skill (`uinaf/attach-cli`)

Agent skill package under `skills/attach-cli/`. Skill SemVer lives in
`skills/attach-cli/.tessl-plugin/plugin.json` and is independent of the npm CLI
version.

Push to `main` touching `skills/attach-cli/**` → `.github/workflows/publish-skill.yml`
→ GitHub Environment `skill-release` (`TESSL_TOKEN`) →
`uinaf/tessl-publish-action` (`review-mode: lint`) →
`scripts/verify-published-skill.sh` (strict Tessl install + Codex discovery).

Cloud Tessl review is not part of publish. Use `review-mode: review` on the
action only for an intentional local/CI score gate.
