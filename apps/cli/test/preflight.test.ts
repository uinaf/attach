import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_UPLOAD_BYTES } from "@uinaf/attach-shared";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const entrypoint = fileURLToPath(new URL("../src/attach.ts", import.meta.url));
let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "attach-preflight-"));
  env = { ...process.env, XDG_CONFIG_HOME: root };
  delete env.ATTACH_API_BASE;
  writeFileSync(
    join(root, "fetch.mjs"),
    `
    globalThis.fetch = async (url, init) => {
      if (init.method === "PUT") return Response.json({
        url: String(url), preview_url: String(url), key: "fixture",
        content_type: init.headers["Content-Type"], size: init.body.byteLength
      });
      return Response.json({ deleted: true, request_url: String(url) });
    };
  `,
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", join(root, "fetch.mjs"), entrypoint, ...args, "--json"],
    {
      env,
      encoding: "utf8",
    },
  );
}

describe("upload preflight", () => {
  it("bounds actual bytes when the file grows after stat", () => {
    const file = join(root, "growing.txt");
    writeFileSync(file, "");
    truncateSync(file, MAX_UPLOAD_BYTES + 1);
    writeFileSync(
      join(root, "fetch.mjs"),
      `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const original = fs.fstatSync;
      fs.fstatSync = (...args) => {
        const stat = original(...args);
        stat.size = 1;
        return stat;
      };
      syncBuiltinESMExports();
      globalThis.fetch = () => { throw new Error("Network must not be reached"); };
    `,
    );
    const result = run(["put", file, "--dry-run"]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe("FILE_TOO_LARGE");
  });
  it("rejects directories as upload inputs", () => {
    const result = run(["put", root, "--dry-run"]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe("FILE_UNREADABLE");
  });
  for (const dryRun of [true, false]) {
    for (const [name, content, size, code] of [
      ["empty.txt", "", 0, "FILE_EMPTY"],
      ["large.txt", "", MAX_UPLOAD_BYTES + 1, "FILE_TOO_LARGE"],
      ["fake.png", "plain text", 10, "UNSUPPORTED_CONTENT"],
      ["image.txt", "<svg></svg>", 11, "UNSUPPORTED_CONTENT"],
      ["file.bin", "plain text", 10, "UNSUPPORTED_CONTENT"],
    ] as const) {
      it(`rejects ${name} locally (dry run: ${dryRun})`, () => {
        const file = join(root, name);
        writeFileSync(file, content);
        truncateSync(file, size);
        const result = run(["put", file, ...(dryRun ? ["--dry-run"] : [])]);
        expect(result.status).toBe(2);
        expect(JSON.parse(result.stdout)).toEqual({ error: expect.objectContaining({ code }) });
      });
    }
  }
  it("accepts the exact shared size limit", () => {
    const file = join(root, "boundary.txt");
    writeFileSync(file, "");
    truncateSync(file, MAX_UPLOAD_BYTES);
    const result = run(["put", file, "--dry-run"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).size).toBe(MAX_UPLOAD_BYTES);
  });
  it("accepts a valid PNG signature", () => {
    const file = join(root, "image.png");
    writeFileSync(file, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const result = run(["put", file, "--dry-run"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).content_type).toBe("image/png");
  });
});

describe("destination parity", () => {
  for (const override of [undefined, "https://other.example"]) {
    it(`uses saved endpoint for put and delete with override ${override}`, () => {
      mkdirSync(join(root, "attach"));
      writeFileSync(
        join(root, "attach", "credentials.json"),
        JSON.stringify({
          token: "att_synthetic",
          key_id: "fixture",
          principal: "user:1",
          stamp: "fixture",
          api_base: "https://custom.example/api",
        }),
      );
      if (override) env.ATTACH_API_BASE = override;
      const file = join(root, "file.txt");
      writeFileSync(file, "valid text");
      const ref = "https://custom.example/o/abcdefghijklmnopqrstuv";
      for (const args of [
        ["put", file],
        ["delete", ref],
      ]) {
        const dry = run([...args, "--dry-run"]);
        expect(dry.status).toBe(0);
        expect(JSON.parse(dry.stdout).target_origin).toBe("https://custom.example");
        const real = run(args);
        expect(real.status).toBe(0);
        const body = JSON.parse(real.stdout);
        expect(body.url ?? body.request_url).toMatch(/^https:\/\/custom.example\/api\/v1\/objects/);
      }
    });
  }
});
