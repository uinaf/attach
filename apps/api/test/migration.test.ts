import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

describe("incremental usage migration", () => {
  it("marks expired rows before reconciling live bytes", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(join(migrations, "0001_init.sql"), "utf8"));
    db.exec(readFileSync(join(migrations, "0002_quota_counters.sql"), "utf8"));

    const now = Date.now();
    db.prepare(
      "INSERT INTO principals (id, kind, display, enabled, created_at) VALUES ('user:migrate', 'user', 't', 1, ?)",
    ).run(now);
    const insertObject = db.prepare(
      `INSERT INTO objects (
        object_key, principal_id, key_id, size_bytes, content_type, digest,
        repo, pr, created_at, expires_at
      ) VALUES (?, 'user:migrate', 'kid', ?, 'image/png', 'd', NULL, NULL, ?, ?)`,
    );
    insertObject.run("live", 100, now - 1_000, now + 60_000);
    insertObject.run("expired", 80, now - 60_000, now - 1_000);
    db.prepare(
      "INSERT INTO principal_usage (principal_id, live_bytes) VALUES ('user:migrate', 180)",
    ).run();

    db.exec(readFileSync(join(migrations, "0003_incremental_usage.sql"), "utf8"));

    const expired = db.prepare("SELECT deleted_at FROM objects WHERE object_key = 'expired'").get();
    const usage = db
      .prepare("SELECT live_bytes FROM principal_usage WHERE principal_id = 'user:migrate'")
      .get();
    expect(expired?.deleted_at).not.toBeNull();
    expect(usage?.live_bytes).toBe(100);
  });
});
