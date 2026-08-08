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

## Enroll

```http
POST /v1/enroll/agent
Authorization: Bearer <jwt>
Accept: application/json
```

Response includes `token` (`att_…`), `key_id`, `principal` (`app:<id>`).

## Upload

```http
PUT /v1/objects
Authorization: Bearer att_…
Content-Type: <mime>
```

Optional metadata headers/query as implemented by the Worker/CLI contract
(`repo`, `pr`). Response includes `url` (raw `/o/…`) and `preview_url`
(`/p/…`).

## Re-enroll

On **401** from put: enroll once more with a new `jti`. If enroll fails because
the principal is disabled, hard-fail — do not loop.

## Secrets

Never log PEM material or `att_` values. Prefer returning `preview_url` to
humans; use raw `url` for markdown embeds. Token rules for `put` live in the
skill Hard rules section.
