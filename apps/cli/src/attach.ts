import { readFileSync } from "node:fs";
import { parseObjectRef, type EnrollResponse, type PutResponse } from "@uinaf/attach-shared";
import { apiBase, clearCredentials, loadCredentials, saveCredentials } from "./config.ts";
import { loginWithDeviceFlow } from "./device-flow.ts";
import { formatPutOutput, type PutOutputMode } from "./put-output.ts";

function usage(): never {
  console.error(`Usage:
  attach login
  attach put <file> [--repo owner/name] [--pr N] [--json|--markdown|--url]
                         (default prints preview URL; --markdown embeds raw /o URL)
  attach delete <url-or-key>
  attach logout

Environment:
  ATTACH_API_BASE            default https://attach.uinaf.dev
  ATTACH_GITHUB_CLIENT_ID    Attach GitHub App client id (required for login)

Also installable as a gh extension (gh attach ...). Does not touch gh auth.`);
  process.exit(2);
}

function parseArgs(argv: string[]): {
  cmd: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  // Support `gh attach ...` where argv may include the extension name.
  const args = [...argv];
  if (args[0] === "attach") args.shift();

  const cmd = args.shift() ?? "";
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json" || a === "--markdown" || a === "--url") {
      flags.output = a.slice(2);
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positionals.push(a);
  }
  return { cmd, positionals, flags };
}

async function enrollHuman(githubToken: string): Promise<EnrollResponse> {
  const res = await fetch(`${apiBase()}/v1/enroll/human`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/json",
    },
  });
  const body = (await res.json()) as EnrollResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `enroll failed: ${res.status}`);
  }
  return body;
}

async function cmdLogin(): Promise<void> {
  const githubToken = await loginWithDeviceFlow((uri, userCode) => {
    console.error(`Open ${uri} and enter code: ${userCode}`);
    console.error("(This uses the Attach GitHub App device flow; gh auth is not modified.)");
  });

  try {
    const enrolled = await enrollHuman(githubToken);
    saveCredentials({
      token: enrolled.token,
      key_id: enrolled.key_id,
      principal: enrolled.principal,
      stamp: enrolled.stamp,
      api_base: apiBase(),
    });
    console.error(`Logged in as ${enrolled.stamp} (${enrolled.principal})`);
    console.error(`Key id: ${enrolled.key_id}`);
  } finally {
    // toxic token: drop reference; GC will reclaim. No persistence.
  }
}

async function requireCreds() {
  const creds = loadCredentials();
  if (!creds?.token) {
    throw new Error("Not logged in. Run: attach login");
  }
  return creds;
}

async function cmdPut(filePath: string, flags: Record<string, string | boolean>): Promise<void> {
  const creds = await requireCreds();
  const bytes = readFileSync(filePath);
  const contentType = guessContentType(filePath, bytes);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    "Content-Type": contentType,
    Accept: "application/json",
  };
  if (typeof flags.repo === "string") headers["X-Attach-Repo"] = flags.repo;
  if (typeof flags.pr === "string") headers["X-Attach-Pr"] = flags.pr;

  let res = await fetch(`${creds.api_base || apiBase()}/v1/objects`, {
    method: "PUT",
    headers,
    body: bytes,
  });

  // Agent-style single transparent re-enroll is N/A for humans without a fresh
  // GitHub token; surface 401 clearly.
  if (res.status === 401) {
    throw new Error("unauthorized (key revoked or principal disabled). Run: attach login");
  }

  const body = (await res.json()) as PutResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `put failed: ${res.status}`);

  const mode = (flags.output as PutOutputMode | undefined) ?? "url";
  console.log(formatPutOutput(body, mode, filePath));
}

async function cmdDelete(ref: string): Promise<void> {
  const creds = await requireCreds();
  const key = parseObjectRef(ref);
  if (!key) throw new Error("invalid object url or key");
  const res = await fetch(`${creds.api_base || apiBase()}/v1/objects/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: "application/json",
    },
  });
  const body = (await res.json()) as { error?: string; deleted?: boolean };
  if (!res.ok) throw new Error(body.error ?? `delete failed: ${res.status}`);
  console.log(JSON.stringify(body));
}

function guessContentType(filePath: string, bytes: Uint8Array): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  // sniff a few
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
}

async function main(): Promise<void> {
  const { cmd, positionals, flags } = parseArgs(process.argv.slice(2));
  try {
    switch (cmd) {
      case "login":
        await cmdLogin();
        break;
      case "put":
        if (!positionals[0]) usage();
        await cmdPut(positionals[0]!, flags);
        break;
      case "delete":
        if (!positionals[0]) usage();
        await cmdDelete(positionals[0]!);
        break;
      case "logout":
        clearCredentials();
        console.error("Logged out.");
        break;
      case "help":
      case "--help":
      case "-h":
        usage();
        break;
      default:
        usage();
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

await main();
