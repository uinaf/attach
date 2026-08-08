import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { softDeleteObject } from "../../src/db.ts";

const now = Date.now();

async function seedObject(objectKey: string, body: string): Promise<string> {
  const principal = `user:http-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 'test', 1, ?)",
    ).bind(principal, now),
    env.DB.prepare(
      `INSERT INTO objects (
        object_key, principal_id, key_id, size_bytes, content_type, digest,
        repo, pr, created_at, expires_at
      ) VALUES (?, ?, 'test-key', ?, 'text/plain', 'sha256:test', NULL, NULL, ?, ?)`,
    ).bind(objectKey, principal, body.length, now, now + 60_000),
  ]);
  await env.BUCKET.put(objectKey, body);
  return principal;
}

describe("Worker HTTP boundary", () => {
  it("serves health through the default fetch handler", async () => {
    const response = await exports.default.fetch("https://attach.test/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, service: "attach" });
  });

  it("serves valid ranges and rejects unsatisfiable ranges", async () => {
    const objectKey = `obj_${crypto.randomUUID()}`;
    await seedObject(objectKey, "0123456789");

    const partial = await exports.default.fetch(`https://attach.test/o/${objectKey}`, {
      headers: { range: "bytes=2-5" },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(partial.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(partial.headers.get("etag")).toBe('"sha256:test"');
    expect(await partial.text()).toBe("2345");

    const invalid = await exports.default.fetch(`https://attach.test/o/${objectKey}`, {
      headers: { range: "bytes=10-20" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
    await invalid.text();
  });

  it("revalidates cached objects against takedown state", async () => {
    const objectKey = `obj_${crypto.randomUUID()}`;
    const principal = await seedObject(objectKey, "cached");

    const cached = await exports.default.fetch(`https://attach.test/o/${objectKey}`);
    const etag = '"sha256:test"';
    expect(cached.headers.get("etag")).toBe(etag);
    await cached.text();

    const unchanged = await exports.default.fetch(`https://attach.test/o/${objectKey}`, {
      headers: { "if-none-match": etag },
    });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");

    await env.BUCKET.delete(objectKey);
    expect(await softDeleteObject(env.DB, objectKey, principal, now + 1)).toBe(true);

    const removed = await exports.default.fetch(`https://attach.test/o/${objectKey}`, {
      headers: { "if-none-match": etag },
    });
    expect(removed.status).toBe(404);
    expect(removed.headers.get("cache-control")).toBe("no-store");
    await removed.text();
  });
});
