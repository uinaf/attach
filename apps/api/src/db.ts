import {
  ENROLLMENTS_PER_DAY,
  PUTS_PER_HOUR,
  STORAGE_BYTES_LIMIT,
  hashApiKeySecret,
  mintApiKey,
  parseApiKey,
  verifyApiKeySecret,
} from "@uinaf/attach-shared";
import type { Env } from "./env.ts";

export type PrincipalRow = {
  id: string;
  kind: "user" | "app";
  display: string;
  enabled: number;
};

export type AuthedKey = {
  keyId: string;
  principal: PrincipalRow;
};

function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function ensurePrincipal(
  db: D1Database,
  id: string,
  kind: "user" | "app",
  display: string,
): Promise<PrincipalRow> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO principals (id, kind, display, enabled, created_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, kind, display, now)
    .run();
  const principal = await db
    .prepare("SELECT id, kind, display, enabled FROM principals WHERE id = ?")
    .bind(id)
    .first<PrincipalRow>();
  if (!principal) throw new Error("principal_create_failed");
  return principal;
}

export async function mintKeyForPrincipal(
  db: D1Database,
  principal: PrincipalRow,
): Promise<{ token: string; keyId: string }> {
  if (!principal.enabled) {
    throw new EnrollError(403, "principal_disabled");
  }
  const minted = mintApiKey();
  const hash = await hashApiKeySecret(minted.secret);
  const now = Date.now();
  const enrollId = crypto.randomUUID();
  const dayStart = now - 24 * 60 * 60 * 1000;

  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO enroll_events (id, principal_id, created_at)
         SELECT ?, ?, ?
         WHERE (
           SELECT COUNT(*) FROM enroll_events
           WHERE principal_id = ? AND created_at >= ?
         ) < ?`,
      )
      .bind(enrollId, principal.id, now, principal.id, dayStart, ENROLLMENTS_PER_DAY),
    db
      .prepare(
        `INSERT INTO api_keys (key_id, principal_id, key_hash, created_at)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM enroll_events WHERE id = ?)`,
      )
      .bind(minted.keyId, principal.id, bytesToBuffer(hash), now, enrollId),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new EnrollError(429, "enrollment_quota");
  }
  if ((results[1]?.meta.changes ?? 0) !== 1) throw new Error("enrollment_commit_failed");

  return { token: minted.token, keyId: minted.keyId };
}

export async function authenticate(
  env: Env,
  authorization: string | null,
): Promise<AuthedKey | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  const parsed = parseApiKey(token);
  if (!parsed) return null;

  const row = await env.DB.prepare(
    `SELECT k.key_id AS key_id, k.key_hash AS key_hash, k.revoked_at AS revoked_at,
            p.id AS principal_id, p.kind AS kind, p.display AS display, p.enabled AS enabled
     FROM api_keys k
     JOIN principals p ON p.id = k.principal_id
     WHERE k.key_id = ?`,
  )
    .bind(parsed.keyId)
    .first<{
      key_id: string;
      key_hash: ArrayBuffer;
      revoked_at: number | null;
      principal_id: string;
      kind: "user" | "app";
      display: string;
      enabled: number;
    }>();

  if (!row || row.revoked_at != null) return null;
  const ok = await verifyApiKeySecret(parsed.secret, new Uint8Array(row.key_hash));
  if (!ok) return null;
  if (!row.enabled) return null;

  return {
    keyId: row.key_id,
    principal: {
      id: row.principal_id,
      kind: row.kind,
      display: row.display,
      enabled: row.enabled,
    },
  };
}

/** How long a claimed put may stay reserved without an objects row. */
export const PUT_RESERVATION_TTL_MS = 15 * 60 * 1000;
const PUT_WINDOW_MS = 60 * 60 * 1000;

async function reclaimExpiredReservations(db: D1Database, now: number): Promise<void> {
  // Successful rolling-rate entries live in put_events; abandoned claims expire here.
  await db.prepare("DELETE FROM put_reservations WHERE expires_at <= ?").bind(now).run();
}

async function expirePrincipalObjects(
  db: D1Database,
  principalId: string,
  now: number,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE principal_usage
         SET live_bytes = MAX(0, live_bytes - COALESCE((
           SELECT SUM(size_bytes) FROM objects
           WHERE principal_id = ? AND deleted_at IS NULL AND expires_at <= ?
         ), 0))
         WHERE principal_id = ?`,
      )
      .bind(principalId, now, principalId),
    db
      .prepare(
        `UPDATE objects SET deleted_at = ?
         WHERE principal_id = ? AND deleted_at IS NULL AND expires_at <= ?`,
      )
      .bind(now, principalId, now),
  ]);
}

/**
 * Reserve rate + storage before upload.
 * Storage capacity is held in put_reservations (not live_bytes) until recordPut
 * commits the object, so TTL reclaim / release cannot desync committed usage.
 */
export async function claimPutQuota(
  db: D1Database,
  principalId: string,
  sizeBytes: number,
  now = Date.now(),
): Promise<{ reservationId: string }> {
  if (sizeBytes > STORAGE_BYTES_LIMIT) {
    throw new ApiError(413, "storage_quota");
  }

  await expirePrincipalObjects(db, principalId, now);
  await reclaimExpiredReservations(db, now);

  const reservationId = crypto.randomUUID();
  const reserved = await db
    .prepare(
      `INSERT INTO put_reservations (id, principal_id, size_bytes, window_start, expires_at)
       SELECT ?, ?, ?, ?, ?
       WHERE (
         COALESCE((SELECT live_bytes FROM principal_usage WHERE principal_id = ?), 0) +
         COALESCE((
           SELECT SUM(size_bytes) FROM put_reservations
           WHERE principal_id = ? AND expires_at > ?
         ), 0) + ?
       ) <= ?
       AND (
         (SELECT COUNT(*) FROM put_events
          WHERE principal_id = ? AND created_at > ?) +
         (SELECT COUNT(*) FROM put_reservations
          WHERE principal_id = ? AND expires_at > ?)
       ) < ?`,
    )
    .bind(
      reservationId,
      principalId,
      sizeBytes,
      now,
      now + PUT_RESERVATION_TTL_MS,
      principalId,
      principalId,
      now,
      sizeBytes,
      STORAGE_BYTES_LIMIT,
      principalId,
      now - PUT_WINDOW_MS,
      principalId,
      now,
      PUTS_PER_HOUR,
    )
    .run();
  if ((reserved.meta.changes ?? 0) === 0) {
    const capacity = await db
      .prepare(
        `SELECT
           COALESCE((SELECT live_bytes FROM principal_usage WHERE principal_id = ?), 0) AS live_bytes,
           COALESCE((SELECT SUM(size_bytes) FROM put_reservations
                     WHERE principal_id = ? AND expires_at > ?), 0) AS reserved_bytes`,
      )
      .bind(principalId, principalId, now)
      .first<{ live_bytes: number; reserved_bytes: number }>();
    if (
      (capacity?.live_bytes ?? 0) + (capacity?.reserved_bytes ?? 0) + sizeBytes >
      STORAGE_BYTES_LIMIT
    ) {
      throw new ApiError(413, "storage_quota");
    }
    throw new ApiError(429, "rate_quota");
  }

  return { reservationId };
}

export async function releasePutQuota(db: D1Database, reservationId: string): Promise<void> {
  await db.prepare("DELETE FROM put_reservations WHERE id = ?").bind(reservationId).run();
}

export async function recordPut(
  db: D1Database,
  args: {
    objectKey: string;
    principalId: string;
    keyId: string;
    sizeBytes: number;
    contentType: string;
    digest: string;
    repo: string | null;
    pr: number | null;
    now: number;
    expiresAt: number;
    reservationId: string;
  },
): Promise<void> {
  const putId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO objects (
          object_key, principal_id, key_id, size_bytes, content_type, digest,
          repo, pr, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        args.objectKey,
        args.principalId,
        args.keyId,
        args.sizeBytes,
        args.contentType,
        args.digest,
        args.repo,
        args.pr,
        args.now,
        args.expiresAt,
      ),
    db
      .prepare("INSERT INTO put_events (id, principal_id, created_at) VALUES (?, ?, ?)")
      .bind(putId, args.principalId, args.now),
    db.prepare("DELETE FROM put_reservations WHERE id = ?").bind(args.reservationId),
    db
      .prepare(
        `INSERT INTO principal_usage (principal_id, live_bytes) VALUES (?, ?)
         ON CONFLICT(principal_id) DO UPDATE
         SET live_bytes = principal_usage.live_bytes + excluded.live_bytes`,
      )
      .bind(args.principalId, args.sizeBytes),
  ]);
}

export async function getLiveObject(db: D1Database, objectKey: string, now = Date.now()) {
  return db
    .prepare(
      `SELECT object_key, principal_id, key_id, size_bytes, content_type, digest,
              repo, pr, created_at, expires_at, deleted_at
       FROM objects
       WHERE object_key = ? AND deleted_at IS NULL AND expires_at > ?`,
    )
    .bind(objectKey, now)
    .first<{
      object_key: string;
      principal_id: string;
      key_id: string;
      size_bytes: number;
      content_type: string;
      digest: string;
      repo: string | null;
      pr: number | null;
      created_at: number;
      expires_at: number;
      deleted_at: number | null;
    }>();
}

export async function softDeleteObject(
  db: D1Database,
  objectKey: string,
  principalId: string,
  now = Date.now(),
): Promise<boolean> {
  const results = await db.batch([
    db
      .prepare(
        `UPDATE principal_usage
         SET live_bytes = MAX(0, live_bytes - (
           SELECT size_bytes FROM objects
           WHERE object_key = ? AND principal_id = ? AND deleted_at IS NULL
         ))
         WHERE principal_id = ? AND EXISTS (
           SELECT 1 FROM objects
           WHERE object_key = ? AND principal_id = ? AND deleted_at IS NULL
         )`,
      )
      .bind(objectKey, principalId, principalId, objectKey, principalId),
    db
      .prepare(
        `UPDATE objects SET deleted_at = ?
         WHERE object_key = ? AND principal_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, objectKey, principalId),
  ]);
  return (results[1]?.meta.changes ?? 0) > 0;
}

export async function bulkRevokePrincipalKeys(
  db: D1Database,
  principalId: string,
  now = Date.now(),
): Promise<void> {
  await db
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE principal_id = ? AND revoked_at IS NULL")
    .bind(now, principalId)
    .run();
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export class EnrollError extends ApiError {}
