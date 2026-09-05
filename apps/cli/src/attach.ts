import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { MAX_UPLOAD_BYTES, validateContent } from "@uinaf/attach-shared";
import type { EnrollResponse, PutResponse } from "@uinaf/attach-shared";
import {
  describeCli,
  formatHumanHelp,
  parseCliArgs,
  type ParsedCommand,
  wantsJson,
} from "./cli-contract.ts";
import { CliError, normalizeCliError } from "./cli-errors.ts";
import {
  apiBase,
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type Credentials,
} from "./config.ts";
import { deviceAuthorizationPrompt, loginWithDeviceFlow } from "./device-flow.ts";
import { attachOrigin, parseObjectRefSyntax, requireMatchingOrigin } from "./object-ref.ts";
import { formatPutOutput } from "./put-output.ts";

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
    throw new CliError("ENROLL_FAILED", body.error ?? `enroll failed: ${res.status}`);
  }
  return body;
}

async function cmdLogin(command: Extract<ParsedCommand, { name: "login" }>): Promise<void> {
  const githubToken = await loginWithDeviceFlow((uri, userCode) => {
    for (const line of deviceAuthorizationPrompt(uri, userCode)) console.error(line);
    console.error("(This uses the Attach GitHub App device flow; gh auth is not modified.)");
  });

  const enrolled = await enrollHuman(githubToken);
  saveCredentials({
    token: enrolled.token,
    key_id: enrolled.key_id,
    principal: enrolled.principal,
    stamp: enrolled.stamp,
    api_base: apiBase(),
  });
  if (command.json) {
    console.log(
      JSON.stringify({
        logged_in: true,
        principal: enrolled.principal,
        stamp: enrolled.stamp,
        key_id: enrolled.key_id,
      }),
    );
    return;
  }
  console.error(`Logged in as ${enrolled.stamp} (${enrolled.principal})`);
  console.error(`Key id: ${enrolled.key_id}`);
}

function requireCreds(creds: Credentials | null) {
  if (!creds?.token) {
    throw new CliError("NOT_LOGGED_IN", "Not logged in. Run: attach login");
  }
  return creds;
}

// Saved credentials stay bound to the service that issued them.
function effectiveApiBase(creds: Credentials | null): string {
  return creds?.api_base || apiBase();
}

type PreparedPut = {
  bytes: Uint8Array;
  contentType: string;
};

function preparePut(filePath: string): PreparedPut {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new CliError("FILE_UNREADABLE", "Upload input must be a regular file.", {
        exitCode: 2,
      });
    }
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new CliError("FILE_TOO_LARGE", "File exceeds the 25 MiB upload limit.", {
        exitCode: 2,
      });
    }
    const chunks: Buffer[] = [];
    let size = 0;
    // Read one extra byte to detect growth beyond the limit after fstat.
    while (size <= MAX_UPLOAD_BYTES) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, MAX_UPLOAD_BYTES + 1 - size));
      const count = readSync(fd, chunk);
      if (count === 0) break;
      size += count;
      if (size > MAX_UPLOAD_BYTES) {
        throw new CliError("FILE_TOO_LARGE", "File exceeds the 25 MiB upload limit.", {
          exitCode: 2,
        });
      }
      chunks.push(chunk.subarray(0, count));
    }
    if (size === 0) {
      throw new CliError("FILE_EMPTY", "File is empty.", { exitCode: 2 });
    }
    const bytes = Buffer.concat(chunks, size);
    const contentType = validateContent(guessContentType(filePath, bytes), bytes.subarray(0, 256));
    if (!contentType) {
      throw new CliError("UNSUPPORTED_CONTENT", "File content is not supported.", { exitCode: 2 });
    }
    return { bytes, contentType };
  } catch (error) {
    if (error instanceof CliError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError("FILE_UNREADABLE", message, { exitCode: 2 });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function cmdPut(command: Extract<ParsedCommand, { name: "put" }>): Promise<void> {
  const prepared = preparePut(command.file);
  const saved = loadCredentials();
  const base = effectiveApiBase(saved);
  if (command.dryRun) {
    const result = {
      dry_run: true,
      file: command.file,
      size: prepared.bytes.byteLength,
      content_type: prepared.contentType,
      repo: command.repo ?? null,
      pr: command.pr ?? null,
      output: command.output,
      target_origin: attachOrigin(base),
    };
    if (command.output === "json") console.log(JSON.stringify(result));
    else {
      console.log(
        `Dry run: ${command.file} (${result.size} bytes, ${result.content_type}) -> ${result.target_origin} [output=${result.output}]`,
      );
    }
    return;
  }

  const creds = requireCreds(saved);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.token}`,
    "Content-Type": prepared.contentType,
    Accept: "application/json",
  };
  if (command.repo) headers["X-Attach-Repo"] = command.repo;
  if (command.pr !== undefined) headers["X-Attach-Pr"] = String(command.pr);

  const res = await fetch(`${base}/v1/objects`, {
    method: "PUT",
    headers,
    body: prepared.bytes,
  });
  if (res.status === 401) {
    throw new CliError(
      "UNAUTHORIZED",
      "unauthorized (key revoked or principal disabled). Run: attach login",
    );
  }

  const body = (await res.json()) as PutResponse & { error?: string };
  if (!res.ok) {
    throw new CliError("PUT_FAILED", body.error ?? `put failed: ${res.status}`);
  }
  console.log(formatPutOutput(body, command.output, command.file));
}

async function cmdDelete(command: Extract<ParsedCommand, { name: "delete" }>): Promise<void> {
  const parsed = parseObjectRefSyntax(command.ref);
  const saved = loadCredentials();
  const base = effectiveApiBase(saved);
  if (command.dryRun) {
    const origin = attachOrigin(base);
    const key = requireMatchingOrigin(parsed, origin);
    const result = { dry_run: true, key, target_origin: origin };
    if (command.json) console.log(JSON.stringify(result));
    else console.log(`Dry run: delete ${key} from ${origin}`);
    return;
  }

  const creds = requireCreds(saved);
  const key = requireMatchingOrigin(parsed, base);
  const res = await fetch(`${base}/v1/objects/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: "application/json",
    },
  });
  const body = (await res.json()) as { error?: string; deleted?: boolean };
  if (!res.ok) {
    throw new CliError("DELETE_FAILED", body.error ?? `delete failed: ${res.status}`);
  }
  console.log(JSON.stringify(body));
}

function cmdLogout(command: Extract<ParsedCommand, { name: "logout" }>): void {
  clearCredentials();
  if (command.json) console.log(JSON.stringify({ logged_out: true }));
  else console.error("Logged out.");
}

function cmdHelp(command: Extract<ParsedCommand, { name: "help" }>): void {
  console.log(command.json ? JSON.stringify(describeCli(), null, 2) : formatHumanHelp());
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
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
}

async function execute(command: ParsedCommand): Promise<void> {
  switch (command.name) {
    case "login":
      await cmdLogin(command);
      return;
    case "put":
      await cmdPut(command);
      return;
    case "delete":
      await cmdDelete(command);
      return;
    case "logout":
      cmdLogout(command);
      return;
    case "help":
      cmdHelp(command);
      return;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = wantsJson(argv);
  try {
    await execute(parseCliArgs(argv));
  } catch (error) {
    const cliError = normalizeCliError(error);
    if (json) {
      console.log(JSON.stringify({ error: { code: cliError.code, message: cliError.message } }));
    } else {
      console.error(cliError.message);
      if (cliError.showUsage) console.error(`\n${formatHumanHelp()}`);
    }
    process.exitCode = cliError.exitCode;
  }
}

await main();
