import { describe, expect, it } from "vite-plus/test";

/** Mirror of serve.ts range parser for unit coverage without Workers runtime. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const startRaw = match[1];
  const endRaw = match[2];
  let start = startRaw ? Number(startRaw) : NaN;
  let end = endRaw ? Number(endRaw) : NaN;
  if (!startRaw && endRaw) {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) return "invalid";
    if (!Number.isFinite(end)) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return "invalid";
  end = Math.min(end, size - 1);
  return { start, end };
}

describe("HTTP Range", () => {
  it("parses open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-200", 100)).toBe("invalid");
  });
});
