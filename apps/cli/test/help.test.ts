import { execFileSync } from "node:child_process";
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
});
