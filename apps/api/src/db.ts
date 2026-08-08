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
  const existing = await db
    .prepare("SELECT id, kind, display, enabled FROM principals WHERE id = ?")
    .bind(id)
    .first<PrincipalRow>();
  if (existing) return existing;

  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
    )
    .bind(id, kind, display, now)
    .run();
  return { id, kind, display, enabled: 1 };
}

export async function countEnrollmentsToday(
  db: D1Database,
  principalId: string,
  now = Date.now(),
): Promise<number> {
  const dayStart = now - 24 * 60 * 60 * 1000;
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM enroll_events WHERE principal_id = ? AND created_at >= ?")
    .bind(principalId, dayStart)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function mintKeyForPrincipal(
  db: D1Database,
  principal: PrincipalRow,
): Promise<{ token: string; keyId: string }> {
  if (!principal.enabled) {
    throw new EnrollError(403, "principal_disabled");
  }
  const enrollments = await countEnrollmentsToday(db, principal.id);
  if (enrollments >= ENROLLMENTS_PER_DAY) {
    throw new EnrollError(429, "enrollment_quota");
  }

  const minted = mintApiKey();
  const hash = await hashApiKeySecret(minted.secret);
  const now = Date.now();
  const enrollId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        "INSERT INTO api_keys (key_id, principal_id, key_hash, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(minted.keyId, principal.id, bytesToBuffer(hash), now),
    db
      .prepare("INSERT INTO enroll_events (id, principal_id, created_at) VALUES (?, ?, ?)")
      .bind(enrollId, principal.id, now),
  ]);

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

/** Hour bucket start (UTC ms). */
export function putWindowStart(now: number): number {
  return Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

/** How long a claimed put may stay reserved without an objects row. */
export const PUT_RESERVATION_TTL_MS = 15 * 60 * 1000;

async function reclaimExpiredReservations(db: D1Database, now: number): Promise<void> {
  // Bill abandoned in-flight puts, then drop the rows — one D1 batch so the
  // hourly cap never sees a gap between delete and quota_windows update.
  await db.batch([
    db
      .prepare(
        `INSERT INTO quota_windows (principal_id, window_start, puts)
         SELECT principal_id, window_start, COUNT(*)
         FROM put_reservations
         WHERE expires_at <= ?
         GROUP BY principal_id, window_start
         ON CONFLICT(principal_id, window_start) DO UPDATE
         SET puts = puts + excluded.puts`,
      )
      .bind(now),
    db.prepare("DELETE FROM put_reservations WHERE expires_at <= ?").bind(now),
  ]);
}

/** Recompute committed live_bytes from live objects (reservations stay separate). */
async function reconcileCommittedUsage(
  db: D1Database,
  principalId: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO principal_usage (principal_id, live_bytes)
       SELECT ?, COALESCE(SUM(size_bytes), 0)
       FROM objects
       WHERE principal_id = ? AND deleted_at IS NULL AND expires_at > ?
       ON CONFLICT(principal_id) DO UPDATE
       SET live_bytes = excluded.live_bytes`,
    )
    .bind(principalId, principalId, now)
    .run();
}

/**
 * Reserve storage before upload; rate is charged only on successful recordPut.
 * Active put_reservations count toward both storage and the hourly put cap.
 */
export async function claimPutQuota(
  db: D1Database,
  principalId: string,
  sizeBytes: number,
  now = Date.now(),
): Promise<{ windowStart: number; reservationId: string }> {
  if (sizeBytes > STORAGE_BYTES_LIMIT) {
    throw new ApiError(413, "storage_quota");
  }

  const windowStart = putWindowStart(now);

  // Soft-delete TTL-expired rows (usage healed by reconcile below).
  await db
    .prepare(
      `UPDATE objects SET deleted_at = ?
       WHERE principal_id = ? AND deleted_at IS NULL AND expires_at <= ?`,
    )
    .bind(now, principalId, now)
    .run();

  // Heal migrate-before-deploy / crash desync; live_bytes is committed-only.
  await reconcileCommittedUsage(db, principalId, now);
  await reclaimExpiredReservations(db, now);

  const reservationId = crypto.randomUUID();
  // Cap storage and in-flight+completed rate in one INSERT (serialized writes).
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
         COALESCE((
           SELECT puts FROM quota_windows
           WHERE principal_id = ? AND window_start = ?
         ), 0) +
         COALESCE((
           SELECT COUNT(*) FROM put_reservations
           WHERE principal_id = ? AND window_start = ? AND expires_at > ?
         ), 0)
       ) < ?`,
    )
    .bind(
      reservationId,
      principalId,
      sizeBytes,
      windowStart,
      now + PUT_RESERVATION_TTL_MS,
      principalId,
      principalId,
      now,
      sizeBytes,
      STORAGE_BYTES_LIMIT,
      principalId,
      windowStart,
      principalId,
      windowStart,
      now,
      PUTS_PER_HOUR,
    )
    .run();
  if ((reserved.meta.changes ?? 0) === 0) {
    // Distinguish rate vs storage for the client when possible.
    const rateLoad = await db
      .prepare(
        `SELECT
           COALESCE((
             SELECT puts FROM quota_windows
             WHERE principal_id = ? AND window_start = ?
           ), 0) +
           COALESCE((
             SELECT COUNT(*) FROM put_reservations
             WHERE principal_id = ? AND window_start = ? AND expires_at > ?
           ), 0) AS used`,
      )
      .bind(principalId, windowStart, principalId, windowStart, now)
      .first<{ used: number }>();
    if ((rateLoad?.used ?? 0) >= PUTS_PER_HOUR) {
      throw new ApiError(429, "rate_quota");
    }
    throw new ApiError(413, "storage_quota");
  }

  return { windowStart, reservationId };
}

export async function releasePutQuota(
  db: D1Database,
  _principalId: string,
  _sizeBytes: number,
  _windowStart: number,
  reservationId: string,
): Promise<void> {
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
    // Bill the claim window only while the reservation still exists.
    // TTL reclaim bills abandoned slots; a missing row means already charged.
    db
      .prepare(
        `INSERT INTO quota_windows (principal_id, window_start, puts)
         SELECT principal_id, window_start, 1
         FROM put_reservations
         WHERE id = ?
         ON CONFLICT(principal_id, window_start) DO UPDATE
         SET puts = puts + 1`,
      )
      .bind(args.reservationId),
    db.prepare("DELETE FROM put_reservations WHERE id = ?").bind(args.reservationId),
    // Refresh committed usage from objects (includes the row just inserted).
    db
      .prepare(
        `INSERT INTO principal_usage (principal_id, live_bytes)
         SELECT ?, COALESCE(SUM(size_bytes), 0)
         FROM objects
         WHERE principal_id = ? AND deleted_at IS NULL AND expires_at > ?
         ON CONFLICT(principal_id) DO UPDATE
         SET live_bytes = excluded.live_bytes`,
      )
      .bind(args.principalId, args.principalId, args.now),
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
  const live = await db
    .prepare(
      `SELECT size_bytes FROM objects
       WHERE object_key = ? AND principal_id = ? AND deleted_at IS NULL`,
    )
    .bind(objectKey, principalId)
    .first<{ size_bytes: number }>();
  if (!live) return false;

  // D1 batch is transactional: soft-delete + usage decrement commit together.
  const results = await db.batch([
    db
      .prepare(
        `UPDATE objects SET deleted_at = ?
         WHERE object_key = ? AND principal_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, objectKey, principalId),
    db
      .prepare(
        `UPDATE principal_usage SET live_bytes = MAX(0, live_bytes - ?)
         WHERE principal_id = ?`,
      )
      .bind(live.size_bytes, principalId),
  ]);
  return (results[0]?.meta.changes ?? 0) > 0;
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
