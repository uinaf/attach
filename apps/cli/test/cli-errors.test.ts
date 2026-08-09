import { describe, expect, it } from "vite-plus/test";
import { CliError, normalizeCliError } from "../src/cli-errors.ts";

describe("CLI errors", () => {
  it("preserves intentionally classified errors", () => {
    const error = new CliError("SAFE", "safe message");
    expect(normalizeCliError(error)).toBe(error);
  });

  it("does not expose unexpected exception text", () => {
    const normalized = normalizeCliError(new Error("Bearer credential-shaped-value"));
    expect(normalized.code).toBe("UNEXPECTED");
    expect(normalized.message).toBe("Unexpected CLI failure. Check configuration and try again.");
    expect(normalized.message).not.toContain("credential-shaped-value");
  });
});
