import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const now = Date.now();

async function seedObject(objectKey: string, body: string): Promise<void> {
  const principal = `user:http-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES (?, 'user', 'test', 1, ?)",
    ).bind(principal, now),
    env.DB.prepare(
      `INSERT INTO objects (
        object_key, principal_id, key_id, size_bytes, content_type, digest,
        repo, pr, created_at, expires_at
      ) VALUES (?, ?, 'test-key', ?, 'text/plain', 'digest', NULL, NULL, ?, ?)`,
    ).bind(objectKey, principal, body.length, now, now + 60_000),
  ]);
  await env.BUCKET.put(objectKey, body);
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
    expect(await partial.text()).toBe("2345");

    const invalid = await exports.default.fetch(`https://attach.test/o/${objectKey}`, {
      headers: { range: "bytes=10-20" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
    await invalid.text();
  });
});
