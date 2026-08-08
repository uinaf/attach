# ADR 001: Auth, principals, jti, quotas, and takedown

Status: accepted  
Date: 2026-08-08

## Context

Attach needs humans and GitHub App agents to upload PR/validation media to R2
and receive public URLs without cookie hacks, fat PAT relay, or Contents:write
tokens hitting the Worker.

## Decision

### Principals

Every `att_` API key belongs to a **principal**:

| Principal      | Source                                              |
| -------------- | --------------------------------------------------- |
| `user:<id>`    | GitHub numeric user id after Attach App device flow |
| `app:<app_id>` | GitHub App id after JWT enrollment                  |

Quotas, enable/disable, and ownership are keyed by principal. Re-enrollment
must not reset principal quotas.

### Human enrollment

1. Human completes Attach GitHub App device flow locally (CLI). Never overwrite
   `gh auth` credentials.
2. CLI exchanges the temporary App user token with the Worker.
3. Worker validates via `POST /applications/{client_id}/token` and allowlists by
   numeric `github_user_id`.
4. Worker mints an `att_` key (hashed at rest with key id). The GitHub token is
   never logged or persisted; discard immediately after identity derivation.

### Agent enrollment

1. Agent signs a short-lived JWT with its existing App PEM:
   - `iss` = `attach:<app_id>` (blocks bare GitHub API JWT replay)
   - `aud` = `attach.uinaf.dev`
   - `exp` ≤ 120s from `iat`
   - `jti` = UUID
2. Worker verifies with the **pinned** App public key for that `app_id` only
   (optional `kid`). Reject unknown alg / `jku` / key URLs.
3. Worker claims `jti` atomically in a Durable Object (not KV). Retention ≥ 180s;
   concurrent exchanges have exactly one winner.
4. Worker mints an `att_` key for principal `app:<app_id>`.

No `ghs_` installation tokens are sent to the Worker.

### Disable

| Who   | Action                                                          |
| ----- | --------------------------------------------------------------- |
| Human | Mark principal disabled and/or revoke all keys for that user id |
| Agent | Remove/disable `app_id` in registry **and** bulk-revoke keys    |

Every `put` checks that the principal is enabled. Agent re-enroll on 401 is at
most one transparent retry; if the principal is disabled, hard-fail (no mint loop).

### Quotas (per principal)

| Quota      | Limit                                      |
| ---------- | ------------------------------------------ |
| Rate       | 60 PUTs / rolling hour                     |
| Storage    | 1 GiB currently retained live object bytes |
| Enrollment | ~10 key issuances / day                    |

Failed uploads and expired/deleted objects do not count toward storage.
Accounting must be concurrency-safe (D1 transactions).

### Upload / serve

- Worker-proxied PUT, 25 MiB streamed (abort oversize; do not trust Content-Length alone)
- Opaque server-generated object keys (≥128-bit CSPRNG); no overwrite
- SVG rejected; allowlisted MIME + magic where applicable
- Routes under `/v1/...`; objects under `/o/<opaque>`
- Object TTL: 2 years
- Serve with CSP sandbox, nosniff, inline for media / attachment for text; HTTP Range for video

### Takedown

Authenticated delete by owning principal removes the R2 object and marks the
row deleted (storage quota released). CDN/cache purge is best-effort; document
propagation latency. CLI: `gh attach delete <url-or-key>`.

Admin allowlist/registry changes are config + redeploy (or secret update). No
admin CLI in v1.

## Consequences

- Upload path never accepts GitHub tokens — only `att_` keys.
- jti replay is structurally impossible without DO/D1 uniqueness.
- Self-hosters pin their own App client id, allowlist, and agent pubkeys.
- Dogfood day one: human `9790196` (altaywtf); agent Glitch `4455325` / `glitch418x`.
