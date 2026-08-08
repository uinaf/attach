import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { claimPutQuota, recordPut } from "../../src/db.ts";
import { STORAGE_BYTES_LIMIT } from "@uinaf/attach-shared";

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
});
