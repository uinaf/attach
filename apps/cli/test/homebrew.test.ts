import { describe, expect, it } from "vite-plus/test";
import { npmTarballUrl, renderHomebrewFormula } from "../scripts/homebrew.ts";

describe("Homebrew formula", () => {
  it("renders an npm-backed formula with both CLI entrypoints", () => {
    const sha256 = "a".repeat(64);
    const formula = renderHomebrewFormula("1.2.3", sha256);

    expect(formula).toContain(
      'url "https://registry.npmjs.org/@uinaf/attach-cli/-/attach-cli-1.2.3.tgz"',
    );
    expect(formula).toContain(`sha256 "${sha256}"`);
    expect(formula).toContain('depends_on "node"');
    expect(formula).toContain('system "npm", "install", *std_npm_args');
    expect(formula).toContain('shell_output("#{bin}/attach --help")');
    expect(formula).toContain('shell_output("#{bin}/gh-attach --help")');
  });

  it("rejects non-release versions and invalid checksums", () => {
    expect(() => npmTarballUrl("1.2.3-beta.1")).toThrow("invalid release version");
    expect(() => renderHomebrewFormula("1.2.3", "abc")).toThrow("invalid npm tarball sha256");
  });
});
