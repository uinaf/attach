import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = join(apiRoot, "wrangler.toml");
const generatedPath = join(apiRoot, "wrangler.deploy.toml");

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
const patched = toml.replace(
  /(database_name\s*=\s*"attach"\s*\n)database_id\s*=\s*"[^"]*"/,
  `$1database_id = "${databaseId}"`,
);
if (patched === toml) {
  console.error("failed to patch database_id in wrangler.toml");
  process.exit(1);
}
writeFileSync(generatedPath, patched);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const config = ["--config", "wrangler.deploy.toml"];
run("wrangler", ["d1", "migrations", "apply", "attach", "--remote", ...config]);
run("wrangler", [
  "deploy",
  ...config,
  "--var",
  `ALLOWED_GITHUB_USER_IDS:${allowedUserIds}`,
  "--var",
  `ATTACH_PUBLIC_BASE:${publicBase}`,
]);
