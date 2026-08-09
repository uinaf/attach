import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageName = "@uinaf/attach-cli";
const versionPattern = /^\d+\.\d+\.\d+$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

function requireVersion(version: string): void {
  if (!versionPattern.test(version)) throw new Error(`invalid release version: ${version}`);
}

function requireSha256(sha256: string): void {
  if (!sha256Pattern.test(sha256)) throw new Error("invalid npm tarball sha256");
}

export function npmTarballUrl(version: string): string {
  requireVersion(version);
  return `https://registry.npmjs.org/${packageName}/-/attach-cli-${version}.tgz`;
}

export function renderHomebrewFormula(version: string, sha256: string): string {
  requireVersion(version);
  requireSha256(sha256);

  return `class Attach < Formula
  desc "Upload PR and validation media to an attach Worker"
  homepage "https://github.com/uinaf/attach"
  url "${npmTarballUrl(version)}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "attach put", shell_output("#{bin}/attach --help")
    assert_match "attach put", shell_output("#{bin}/gh-attach --help")
  end
end
`;
}

export async function writeHomebrewFormula(
  version: string,
  outputPath: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(npmTarballUrl(version));
  if (!response.ok) throw new Error(`npm tarball download failed: ${response.status}`);

  const tarball = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(tarball).digest("hex");
  await writeFile(outputPath, renderHomebrewFormula(version, sha256), "utf8");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  const [version, outputPath] = process.argv.slice(2);
  if (!version || !outputPath) {
    console.error("usage: node apps/cli/scripts/homebrew.ts VERSION OUTPUT_PATH");
    process.exitCode = 2;
  } else {
    writeHomebrewFormula(version, outputPath).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "homebrew formula generation failed");
      process.exitCode = 1;
    });
  }
}
