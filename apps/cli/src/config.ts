import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ATTACH_API_BASE_DEFAULT } from "@uinaf/attach-shared";

export type Credentials = {
  token: string;
  key_id: string;
  principal: string;
  stamp: string;
  api_base: string;
};

export function apiBase(): string {
  return (process.env.ATTACH_API_BASE ?? ATTACH_API_BASE_DEFAULT).replace(/\/$/, "");
}

export function clientId(): string {
  const id = process.env.ATTACH_GITHUB_CLIENT_ID;
  if (!id) {
    throw new Error(
      "ATTACH_GITHUB_CLIENT_ID is required (Attach GitHub App client id). See docs/deploy.md",
    );
  }
  return id;
}

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "attach") : join(homedir(), ".config", "attach");
}

export function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

export function loadCredentials(): Credentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = credentialsPath();
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
}

export function clearCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) rmSync(path);
}
