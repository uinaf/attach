# GitHub App agent enroll

For automation that already has a GitHub App private key. Not wired into the
`attach` CLI binary — use HTTP enroll, then upload with the minted `att_` key.

## Prerequisites

- App id and **public** key registered in Worker secret `AGENT_REGISTRY`
- App **private** key available only in the agent’s secret store (never chat)
- `ATTACH_API_BASE` / public host matching Worker `ATTACH_PUBLIC_BASE`

## JWT

Sign RS256 (optional `kid`) with claims:

| Claim | Value                                                                           |
| ----- | ------------------------------------------------------------------------------- |
| `iss` | `attach:<github_app_id>`                                                        |
| `aud` | public attach host (e.g. `attach.uinaf.dev`) — same origin as `ATTACH_API_BASE` |
| `exp` | ≤ `iat + 120`                                                                   |
| `jti` | fresh UUID (one-time; Durable Object claims it)                                 |

Reject any flow that uses bare GitHub API JWTs, `jku`, or remote JWKS.

## Enroll (credential-safe)

Prefer language-native HTTP (`fetch`, etc.) that sets `Authorization` from
memory and parses JSON in-process — never put the bearer in argv, never print
`att_` to chat or logs.

If you must use curl, keep each secret step self-contained with immediate
cleanup (do not stack EXIT traps across enroll then put):

```bash
base="${ATTACH_API_BASE:-https://attach.uinaf.dev}"
hdr="$(mktemp)"; out="$(mktemp)"
printf 'Authorization: Bearer %s\nAccept: application/json\n' "$ATTACH_AGENT_JWT" >"$hdr"
curl -sS -X POST "$base/v1/enroll/agent" -H @"$hdr" -o "$out"
# parse "$out" in-process for .token → secret var only
rm -f "$hdr" "$out"
```

Expect JSON with `token` (`att_…`), `key_id`, `principal` (`app:<id>`). If the
response indicates the principal is disabled, hard-fail.

## Upload

Same rules: prefer native HTTP. Curl pattern (separate temps; delete before next step):

```bash
base="${ATTACH_API_BASE:-https://attach.uinaf.dev}"
hdr="$(mktemp)"; out="$(mktemp)"
printf 'Authorization: Bearer %s\nContent-Type: image/png\n' "$ATTACH_ATT_TOKEN" >"$hdr"
curl -sS -X PUT "$base/v1/objects" -H @"$hdr" --data-binary @"$FILE" -o "$out"
# read url + preview_url from "$out" only
rm -f "$hdr" "$out"
```

Optional `repo` / `pr` metadata per Worker/CLI contract. Success only when the
JSON includes both `url` (raw `/o/…`) and `preview_url` (`/p/…`).

## Re-enroll

On **401** from put: mint a new JWT (`jti`), enroll once, put again. If enroll
fails because the principal is disabled, or a second put still returns 401,
hard-fail — do not loop.

## Secrets

Never log PEM material or `att_` values. Prefer returning `preview_url` to
humans; use raw `url` for markdown embeds. Token rules for `put` live in the
skill Hard rules section.
