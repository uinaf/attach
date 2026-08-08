import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ENROLLMENTS_PER_DAY } from "@uinaf/attach-shared";
import { ensurePrincipal, mintKeyForPrincipal } from "../../src/db.ts";

describe("principal enrollment", () => {
  it("creates one principal and caps concurrent key issuance", async () => {
    const principalId = `user:enroll-${crypto.randomUUID()}`;
    const principals = await Promise.all(
      Array.from({ length: 4 }, () =>
        ensurePrincipal(env.DB, principalId, "user", "concurrent-test"),
      ),
    );
    expect(new Set(principals.map((principal) => principal.id))).toEqual(new Set([principalId]));

    const results = await Promise.allSettled(
      Array.from({ length: ENROLLMENTS_PER_DAY + 2 }, () =>
        mintKeyForPrincipal(env.DB, principals[0]),
      ),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(ENROLLMENTS_PER_DAY);
    expect(rejected).toHaveLength(2);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({ status: 429, code: "enrollment_quota" });
    }

    const events = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM enroll_events WHERE principal_id = ?",
    )
      .bind(principalId)
      .first<{ count: number }>();
    const keys = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM api_keys WHERE principal_id = ?",
    )
      .bind(principalId)
      .first<{ count: number }>();
    expect(events?.count).toBe(ENROLLMENTS_PER_DAY);
    expect(keys?.count).toBe(ENROLLMENTS_PER_DAY);
  });
});
