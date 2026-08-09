import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const entrypoint = fileURLToPath(new URL("../src/attach.ts", import.meta.url));

describe("CLI help", () => {
  for (const command of ["help", "--help", "-h"]) {
    it(`${command} prints usage and exits successfully`, () => {
      const output = execFileSync(process.execPath, [entrypoint, command], { encoding: "utf8" });
      expect(output).toContain("attach put <file>");
    });
  }

  it("describes every command as JSON", () => {
    const output = execFileSync(process.execPath, [entrypoint, "help", "--json"], {
      encoding: "utf8",
    });
    const description = JSON.parse(output) as {
      schema_version: number;
      commands: Array<{ name: string }>;
    };
    expect(description.schema_version).toBe(1);
    expect(description.commands.map((command) => command.name)).toEqual([
      "login",
      "put",
      "delete",
      "logout",
      "help",
    ]);
  });

  it("returns structured parse errors with exit code 2", () => {
    const result = spawnSync(
      process.execPath,
      [entrypoint, "put", "shot.png", "--unknown", "--json"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      error: expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    });
  });

  it("returns an actionable JSON error when a custom service has no client id", () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ATTACH_API_BASE: "https://custom.example",
    };
    delete env.ATTACH_GITHUB_CLIENT_ID;
    const result = spawnSync(process.execPath, [entrypoint, "login", "--json"], {
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: "GITHUB_CLIENT_ID_REQUIRED",
        message:
          "ATTACH_GITHUB_CLIENT_ID is required for a custom ATTACH_API_BASE. See docs/deploy.md",
      },
    });
  });

  it("rejects malformed delete input before reading credentials", () => {
    const result = spawnSync(
      process.execPath,
      [entrypoint, "delete", "/o/../abcdefghijklmnopqrstuv", "--json"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          XDG_CONFIG_HOME: join(tmpdir(), "attach-cli-deliberately-missing-config"),
        },
      },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      error: expect.objectContaining({ code: "INVALID_OBJECT_REF" }),
    });
  });

  it("dry-runs put without credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "attach-cli-test-"));
    const file = join(root, "shot.png");
    writeFileSync(file, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const result = spawnSync(
      process.execPath,
      [entrypoint, "put", file, "--repo", "uinaf/attach", "--pr", "15", "--dry-run", "--json"],
      {
        encoding: "utf8",
        env: { ...process.env, XDG_CONFIG_HOME: join(root, "missing-config") },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      dry_run: true,
      file,
      size: 4,
      content_type: "image/png",
      repo: "uinaf/attach",
      pr: 15,
      output: "json",
      target_origin: "https://attach.uinaf.dev",
    });
  });

  it("dry-runs delete against a configured custom origin without credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "attach-cli-test-"));
    const key = "abcdefghijklmnopqrstuv";
    const result = spawnSync(
      process.execPath,
      [entrypoint, "delete", `https://custom.example/p/${key}`, "--dry-run", "--json"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ATTACH_API_BASE: "https://custom.example/api",
          XDG_CONFIG_HOME: join(root, "missing-config"),
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      dry_run: true,
      key,
      target_origin: "https://custom.example",
    });
  });

  it("uses the stored custom base for normal delete origin validation", () => {
    const root = mkdtempSync(join(tmpdir(), "attach-cli-test-"));
    const config = join(root, "attach");
    mkdirSync(config);
    writeFileSync(
      join(config, "credentials.json"),
      JSON.stringify({
        token: "test-token",
        key_id: "test-key",
        principal: "user:1",
        stamp: "test",
        api_base: "https://custom.example/api",
      }),
    );
    const key = "abcdefghijklmnopqrstuv";
    const result = spawnSync(
      process.execPath,
      [entrypoint, "delete", `https://other.example/p/${key}`, "--json"],
      {
        encoding: "utf8",
        env: { ...process.env, XDG_CONFIG_HOME: root },
      },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      error: expect.objectContaining({
        code: "INVALID_OBJECT_REF",
        message: "object URL origin must match https://custom.example",
      }),
    });
  });

  it("does not expose unexpected credential-bearing exception text", () => {
    const root = mkdtempSync(join(tmpdir(), "attach-cli-test-"));
    const config = join(root, "attach");
    mkdirSync(config);
    const malformedToken = ["line", "break"].join("\n");
    writeFileSync(
      join(config, "credentials.json"),
      JSON.stringify({
        token: malformedToken,
        key_id: "test-key",
        principal: "user:1",
        stamp: "test",
        api_base: "https://attach.uinaf.dev",
      }),
    );
    const file = fileURLToPath(new URL("../../../README.md", import.meta.url));
    const result = spawnSync(process.execPath, [entrypoint, "put", file, "--json"], {
      encoding: "utf8",
      env: { ...process.env, XDG_CONFIG_HOME: root },
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      error: {
        code: "UNEXPECTED",
        message: "Unexpected CLI failure. Check configuration and try again.",
      },
    });
    expect(result.stdout).not.toContain("line");
    expect(result.stdout).not.toContain("break");
  });
});
