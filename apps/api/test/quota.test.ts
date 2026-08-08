import { describe, expect, it } from "vite-plus/test";
import { putWindowStart } from "../src/db.ts";

describe("putWindowStart", () => {
  it("buckets to the UTC hour", () => {
    expect(putWindowStart(Date.parse("2026-08-08T15:42:11.000Z"))).toBe(
      Date.parse("2026-08-08T15:00:00.000Z"),
    );
    expect(putWindowStart(Date.parse("2026-08-08T15:00:00.000Z"))).toBe(
      Date.parse("2026-08-08T15:00:00.000Z"),
    );
  });
});
