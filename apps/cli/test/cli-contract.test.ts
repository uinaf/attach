import { describe, expect, it } from "vite-plus/test";
import { describeCli, formatHumanHelp, parseCliArgs, wantsJson } from "../src/cli-contract.ts";
import { CliError } from "../src/cli-errors.ts";

function expectInvalid(argv: string[], message: string): void {
  try {
    parseCliArgs(argv);
    throw new Error("expected parse failure");
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe("INVALID_ARGUMENT");
    expect((error as CliError).message).toContain(message);
  }
}

describe("CLI contract", () => {
  it("parses documented put flags and optional gh extension argv", () => {
    expect(
      parseCliArgs([
        "attach",
        "put",
        "/tmp/shot.png",
        "--repo",
        "uinaf/attach",
        "--pr",
        "15",
        "--json",
        "--dry-run",
      ]),
    ).toEqual({
      name: "put",
      file: "/tmp/shot.png",
      repo: "uinaf/attach",
      pr: 15,
      dryRun: true,
      output: "json",
    });
  });

  it.each([
    { argv: ["put", "a", "b"], message: "expects 1 positional" },
    { argv: ["put", "a", "--wat"], message: "Unknown option" },
    { argv: ["put", "a", "--repo"], message: "argument missing" },
    { argv: ["put", "a", "--json", "--url"], message: "mutually exclusive" },
    { argv: ["put", "a", "--repo", "bad"], message: "owner/name" },
    { argv: ["put", "a", "--repo=-bad/repo"], message: "owner/name" },
    { argv: ["put", "a", "--pr", "0"], message: "positive integer" },
    { argv: ["put", "a", "--pr", "1.5"], message: "positive integer" },
    { argv: ["delete"], message: "expects 1 positional" },
    { argv: ["logout", "extra"], message: "expects 0 positional" },
    { argv: ["unknown"], message: "unknown command" },
  ])("rejects invalid argv: $argv", ({ argv, message }) => {
    expectInvalid(argv, message);
  });

  it("generates human and JSON discovery from the command definitions", () => {
    expect(formatHumanHelp()).toContain(
      "attach put <file> [--repo <owner/name>] [--pr <positive-integer>] [--dry-run] [--json|--markdown|--url]",
    );
    const description = describeCli();
    expect(description.schema_version).toBe(1);
    expect(description.commands.map((command) => command.name)).toEqual([
      "login",
      "put",
      "delete",
      "logout",
      "help",
    ]);
    expect(description.commands.find((command) => command.name === "put")?.flags).toContainEqual(
      expect.objectContaining({ name: "dry-run" }),
    );
    expect(description.commands.find((command) => command.name === "put")?.flags).toContainEqual(
      expect.objectContaining({ name: "pr", type: "positive-integer" }),
    );
  });

  it("does not treat a positional after -- as JSON mode", () => {
    expect(wantsJson(["put", "--", "--json"])).toBe(false);
    expect(wantsJson(["put", "shot.png", "--json"])).toBe(true);
  });
});
