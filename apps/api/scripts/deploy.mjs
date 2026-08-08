import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = join(apiRoot, "wrangler.toml");
const generatedPath = join(apiRoot, "wrangler.deploy.toml");
const wranglerJs = join(apiRoot, "node_modules", "wrangler", "bin", "wrangler.js");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`missing env ${name}`);
    process.exit(1);
  }
  return value;
}

const databaseId = requireEnv("CLOUDFLARE_D1_DATABASE_ID");
const allowedUserIds = requireEnv("ALLOWED_GITHUB_USER_IDS");
const publicBase = requireEnv("ATTACH_PUBLIC_BASE");

const toml = readFileSync(tomlPath, "utf8");
const patched = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${databaseId}"`);
if (patched === toml || !patched.includes(`database_id = "${databaseId}"`)) {
  console.error("failed to patch database_id in wrangler.toml");
  process.exit(1);
}
writeFileSync(generatedPath, patched);

function run(args) {
  const result = spawnSync(process.execPath, [wranglerJs, ...args], {
    cwd: apiRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const config = ["--config", "wrangler.deploy.toml"];
run(["d1", "migrations", "apply", "attach", "--remote", ...config]);
run([
  "deploy",
  ...config,
  "--var",
  `ALLOWED_GITHUB_USER_IDS:${allowedUserIds}`,
  "--var",
  `ATTACH_PUBLIC_BASE:${publicBase}`,
]);
