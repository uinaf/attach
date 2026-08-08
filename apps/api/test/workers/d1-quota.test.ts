import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { claimPutQuota, recordPut, softDeleteObject } from "../../src/db.ts";
import { PUTS_PER_HOUR, STORAGE_BYTES_LIMIT } from "@uinaf/attach-shared";

const now = Date.parse("2026-08-08T15:30:00.000Z");

describe("D1 quota (workers pool)", () => {
  it("applies migrations and enforces storage quota", async () => {
    // Unique principal: workers pool uses isolatedStorage: false (SQLite DO shm).
    const principal = `user:workers-quota-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 't', 1, ?)",
    )
      .bind(principal, now)
      .run();

    const claim = await claimPutQuota(env.DB, principal, 100, now);
    await recordPut(env.DB, {
      objectKey: `obj_${crypto.randomUUID()}`,
      principalId: principal,
      keyId: "kid",
      sizeBytes: 100,
      contentType: "image/png",
      digest: "d",
      repo: null,
      pr: null,
      now,
      expiresAt: now + 86_400_000,
      reservationId: claim.reservationId,
    });

    const usage = await env.DB.prepare(
      "SELECT live_bytes AS b FROM principal_usage WHERE principal_id = ?",
    )
      .bind(principal)
      .first<{ b: number }>();
    expect(usage?.b).toBe(100);

    await expect(
      claimPutQuota(env.DB, principal, STORAGE_BYTES_LIMIT, now + 1),
    ).rejects.toMatchObject({
      status: 413,
      code: "storage_quota",
    });
  });

  it("decrements storage once under concurrent deletes", async () => {
    const principal = `user:workers-delete-${crypto.randomUUID()}`;
    const target = `obj_${crypto.randomUUID()}`;
    const survivor = `obj_${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 't', 1, ?)",
      ).bind(principal, now),
      env.DB.prepare(
        `INSERT INTO objects (
          object_key, principal_id, key_id, size_bytes, content_type, digest,
          repo, pr, created_at, expires_at
        ) VALUES (?, ?, 'kid', 100, 'image/png', 'd', NULL, NULL, ?, ?)`,
      ).bind(target, principal, now, now + 86_400_000),
      env.DB.prepare(
        `INSERT INTO objects (
          object_key, principal_id, key_id, size_bytes, content_type, digest,
          repo, pr, created_at, expires_at
        ) VALUES (?, ?, 'kid', 50, 'image/png', 'd', NULL, NULL, ?, ?)`,
      ).bind(survivor, principal, now, now + 86_400_000),
      env.DB.prepare("INSERT INTO principal_usage (principal_id, live_bytes) VALUES (?, 150)").bind(
        principal,
      ),
    ]);

    const deleted = await Promise.all([
      softDeleteObject(env.DB, target, principal, now + 1),
      softDeleteObject(env.DB, target, principal, now + 2),
    ]);
    expect(deleted.filter(Boolean)).toHaveLength(1);
    expect(deleted.filter((value) => !value)).toHaveLength(1);

    const usage = await env.DB.prepare(
      "SELECT live_bytes AS bytes FROM principal_usage WHERE principal_id = ?",
    )
      .bind(principal)
      .first<{ bytes: number }>();
    expect(usage?.bytes).toBe(50);
  });

  it("caps concurrent rolling-hour reservations", async () => {
    const principal = `user:workers-rate-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 't', 1, ?)",
    )
      .bind(principal, now)
      .run();

    const results = await Promise.allSettled(
      Array.from({ length: PUTS_PER_HOUR + 2 }, () => claimPutQuota(env.DB, principal, 1, now)),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(PUTS_PER_HOUR);
    expect(rejected).toHaveLength(2);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({ status: 429, code: "rate_quota" });
    }

    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM put_reservations WHERE principal_id = ?",
    )
      .bind(principal)
      .first<{ count: number }>();
    expect(active?.count).toBe(PUTS_PER_HOUR);
  });
});
