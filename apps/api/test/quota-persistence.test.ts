import { describe, expect, it } from "vite-plus/test";
import {
  ApiError,
  claimPutQuota,
  PUT_RESERVATION_TTL_MS,
  recordPut,
  releasePutQuota,
} from "../src/db.ts";
import { PUTS_PER_HOUR, STORAGE_BYTES_LIMIT } from "@uinaf/attach-shared";
import { openMemoryD1 } from "./d1-memory.ts";

const principal = "user:1";
const now = Date.parse("2026-08-08T15:30:00.000Z");

async function ensurePrincipal(db: D1Database) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 't', 1, ?)",
    )
    .bind(principal, now)
    .run();
}

describe("claimPutQuota / release / recordPut", () => {
  it("claims, records, and frees storage capacity", async () => {
    const db = openMemoryD1();
    await ensurePrincipal(db);

    const claim = await claimPutQuota(db, principal, 100, now);
    expect(claim.reservationId).toBeTruthy();

    await recordPut(db, {
      objectKey: "obj_a",
      principalId: principal,
      keyId: "kid",
      sizeBytes: 100,
      contentType: "image/png",
      digest: "d",
      repo: null,
      pr: null,
      now,
      committedAt: now,
      expiresAt: now + 86_400_000,
      reservationId: claim.reservationId,
    });

    const usage = await db
      .prepare("SELECT live_bytes AS b FROM principal_usage WHERE principal_id = ?")
      .bind(principal)
      .first<{ b: number }>();
    expect(usage?.b).toBe(100);

    await expect(claimPutQuota(db, principal, STORAGE_BYTES_LIMIT, now + 1)).rejects.toMatchObject({
      status: 413,
      code: "storage_quota",
    });

    const again = await claimPutQuota(db, principal, 50, now + 1);
    expect(again.reservationId).toBeTruthy();
    await releasePutQuota(db, again.reservationId);
  });

  it("rejects a late commit after another claim reuses its reservation", async () => {
    const db = openMemoryD1();
    await ensurePrincipal(db);
    const claim = await claimPutQuota(db, principal, STORAGE_BYTES_LIMIT, now);
    const committedAt = now + PUT_RESERVATION_TTL_MS;
    const replacement = await claimPutQuota(db, principal, STORAGE_BYTES_LIMIT, committedAt);

    await expect(
      recordPut(db, {
        objectKey: "obj_expired_reservation",
        principalId: principal,
        keyId: "kid",
        sizeBytes: STORAGE_BYTES_LIMIT,
        contentType: "image/png",
        digest: "d",
        repo: null,
        pr: null,
        now,
        committedAt,
        expiresAt: now + 86_400_000,
        reservationId: claim.reservationId,
      }),
    ).rejects.toMatchObject({ status: 409, code: "put_reservation_expired" });

    const object = await db
      .prepare("SELECT object_key FROM objects WHERE object_key = ?")
      .bind("obj_expired_reservation")
      .first();
    const usage = await db
      .prepare("SELECT live_bytes FROM principal_usage WHERE principal_id = ?")
      .bind(principal)
      .first();
    const events = await db
      .prepare("SELECT COUNT(*) AS count FROM put_events WHERE principal_id = ?")
      .bind(principal)
      .first<{ count: number }>();
    const reservations = await db
      .prepare("SELECT COUNT(*) AS count FROM put_reservations WHERE principal_id = ?")
      .bind(principal)
      .first<{ count: number }>();
    expect(object).toBeNull();
    expect(usage).toBeNull();
    expect(events?.count).toBe(0);
    expect(reservations?.count).toBe(1);
    expect(
      await db
        .prepare("SELECT id FROM put_reservations WHERE id = ?")
        .bind(replacement.reservationId)
        .first(),
    ).not.toBeNull();
  });

  it("rejects when storage would exceed the limit", async () => {
    const db = openMemoryD1();
    await ensurePrincipal(db);
    await expect(claimPutQuota(db, principal, STORAGE_BYTES_LIMIT + 1, now)).rejects.toMatchObject({
      status: 413,
      code: "storage_quota",
    } satisfies Partial<ApiError>);
  });

  it("rejects when the hourly put rate is exhausted", async () => {
    const db = openMemoryD1();
    await ensurePrincipal(db);
    for (let i = 0; i < PUTS_PER_HOUR; i += 1) {
      await claimPutQuota(db, principal, 1, now);
    }
    await expect(claimPutQuota(db, principal, 1, now)).rejects.toMatchObject({
      status: 429,
      code: "rate_quota",
    });
  });

  it("soft-deletes expired objects before reclaiming storage", async () => {
    const db = openMemoryD1();
    await ensurePrincipal(db);
    await db
      .prepare(
        `INSERT INTO objects (
          object_key, principal_id, key_id, size_bytes, content_type, digest,
          repo, pr, created_at, expires_at
        ) VALUES (?, ?, 'k', ?, 'image/png', 'd', NULL, NULL, ?, ?)`,
      )
      .bind("old", principal, STORAGE_BYTES_LIMIT, now - 10_000, now - 1)
      .run();
    await db
      .prepare(
        "INSERT INTO principal_usage (principal_id, live_bytes) VALUES (?, ?) ON CONFLICT DO UPDATE SET live_bytes = excluded.live_bytes",
      )
      .bind(principal, STORAGE_BYTES_LIMIT)
      .run();

    const claim = await claimPutQuota(db, principal, 50, now);
    expect(claim.reservationId).toBeTruthy();
    const expired = await db
      .prepare("SELECT deleted_at AS d FROM objects WHERE object_key = ?")
      .bind("old")
      .first<{ d: number | null }>();
    expect(expired?.d).toBe(now);
    const usage = await db
      .prepare("SELECT live_bytes AS bytes FROM principal_usage WHERE principal_id = ?")
      .bind(principal)
      .first<{ bytes: number }>();
    expect(usage?.bytes).toBe(0);
  });
});
