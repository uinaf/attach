import { describe, expect, it } from "vite-plus/test";
import { CliError } from "../src/cli-errors.ts";
import { attachOrigin, parseObjectRefSyntax, requireMatchingOrigin } from "../src/object-ref.ts";

const key = "abcdefghijklmnopqrstuv";

function expectInvalid(ref: string, message: string): void {
  expect(() => parseObjectRefSyntax(ref)).toThrowError(CliError);
  expect(() => parseObjectRefSyntax(ref)).toThrowError(message);
}

describe("CLI object references", () => {
  it.each([
    [key, undefined],
    [`/o/${key}`, undefined],
    [`/p/${key}`, undefined],
    [`https://attach.uinaf.dev/o/${key}`, "https://attach.uinaf.dev"],
  ])("parses %s", (ref, origin) => {
    expect(parseObjectRefSyntax(ref)).toEqual({ key, ...(origin ? { origin } : {}) });
  });

  it.each([
    [`/o/${key}?x=1`, "query string"],
    [`https://attach.uinaf.dev/p/${key}#x`, "query string or fragment"],
    [`https://attach.uinaf.dev/o/%2e%2e`, "percent encoding"],
    [`/o/../${key}`, "traversal segments"],
    [`https://attach.uinaf.dev/x/../o/${key}`, "traversal segments"],
    [`https://attach.uinaf.dev/o/${key}?`, "query string or fragment"],
    [`https://attach.uinaf.dev/o/${key}#`, "query string or fragment"],
    [String.raw`https://attach.uinaf.dev\x\..\o\${key}`, "backslashes"],
    [`https://attach.uinaf.dev/o/${key}\n`, "control characters"],
  ])("rejects %s", (ref, message) => {
    expectInvalid(ref, message);
  });

  it("rejects URL credentials", () => {
    const url = new URL(`https://attach.uinaf.dev/o/${key}`);
    url.username = "test-user";
    url.password = "test-password";
    expectInvalid(url.toString(), "credentials");
  });

  it("enforces the effective attach origin", () => {
    const parsed = parseObjectRefSyntax(`https://custom.example/o/${key}`);
    expect(requireMatchingOrigin(parsed, "https://custom.example/api")).toBe(key);
    expect(() => requireMatchingOrigin(parsed, "https://attach.uinaf.dev")).toThrowError(
      "origin must match https://attach.uinaf.dev",
    );
  });

  it("validates API bases", () => {
    expect(attachOrigin("https://custom.example/path")).toBe("https://custom.example");
    expect(() => attachOrigin("file:///tmp/attach")).toThrowError("must be an http(s) origin");
    expect(() => attachOrigin("https://custom.example?token=nope")).toThrowError(
      "must be an http(s) origin",
    );
  });
});
