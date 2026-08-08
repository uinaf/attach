import { chmodSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// npm publish strips bin paths ending in .mjs; emit dist/attach.js instead.
const root = join(import.meta.dirname, "..", "dist");
const from = join(root, "attach.mjs");
const to = join(root, "attach.js");
if (!existsSync(from)) {
  throw new Error(`missing ${from}`);
}
if (existsSync(to)) unlinkSync(to);
renameSync(from, to);
chmodSync(to, 0o755);
