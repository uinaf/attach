import { describe, expect, it } from "vite-plus/test";
import { PUTS_PER_HOUR } from "@uinaf/attach-shared";
import { claimPutQuota } from "../src/db.ts";
import { openMemoryD1 } from "./d1-memory.ts";

describe("rolling PUT quota", () => {
  it("does not reset at a clock-hour boundary", async () => {
    const db = openMemoryD1();
    const principal = "user:rolling";
    const eventTime = Date.parse("2026-08-08T15:30:00.000Z");
    await db
      .prepare(
        "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 't', 1, ?)",
      )
      .bind(principal, eventTime)
      .run();
    for (let index = 0; index < PUTS_PER_HOUR; index += 1) {
      await db
        .prepare("INSERT INTO put_events (id, principal_id, created_at) VALUES (?, ?, ?)")
        .bind(`event-${index}`, principal, eventTime)
        .run();
    }

    await expect(
      claimPutQuota(db, principal, 1, Date.parse("2026-08-08T16:29:59.999Z")),
    ).rejects.toMatchObject({ status: 429, code: "rate_quota" });
    await expect(
      claimPutQuota(db, principal, 1, Date.parse("2026-08-08T16:30:00.000Z")),
    ).resolves.toHaveProperty("reservationId");
  });
});
