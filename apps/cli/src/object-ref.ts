import { CliError } from "./cli-errors.ts";

const OBJECT_PATH = /^\/(?:o|p)\/([A-Za-z0-9_-]{20,})$/;
const OBJECT_KEY = /^[A-Za-z0-9_-]{20,}$/;
const PERCENT_ENCODING = /%[0-9a-f]{2}/i;

type ParsedObjectRef = {
  key: string;
  origin?: string;
};

function invalidRef(message: string): CliError {
  return new CliError("INVALID_OBJECT_REF", message, { exitCode: 2 });
}

function containsControlCharacter(input: string): boolean {
  for (let index = 0; index < input.length; index++) {
    const codeUnit = input.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true;
  }
  return false;
}

export function parseObjectRefSyntax(input: string): ParsedObjectRef {
  if (containsControlCharacter(input))
    throw invalidRef("object reference contains control characters");
  const trimmed = input.trim();
  if (trimmed !== input)
    throw invalidRef("object reference must not contain surrounding whitespace");
  if (PERCENT_ENCODING.test(trimmed))
    throw invalidRef("object reference must not contain percent encoding");
  if (trimmed.includes("?") || trimmed.includes("#"))
    throw invalidRef("object reference must not contain a query string or fragment");
  if (trimmed.includes("\\")) throw invalidRef("object reference must not contain backslashes");
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(trimmed))
    throw invalidRef("object reference must not contain traversal segments");
  if (OBJECT_KEY.test(trimmed)) return { key: trimmed };

  if (trimmed.startsWith("/")) {
    const match = OBJECT_PATH.exec(trimmed);
    if (!match) throw invalidRef("invalid object path");
    return { key: match[1]! };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalidRef("invalid object URL or key");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw invalidRef("object URL must use http or https");
  }
  if (url.username || url.password) throw invalidRef("object URL must not contain credentials");
  const match = OBJECT_PATH.exec(url.pathname);
  if (!match) throw invalidRef("invalid object URL path");
  return { key: match[1]!, origin: url.origin };
}

export function attachOrigin(base: string): string {
  try {
    const url = new URL(base);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("unsupported URL");
    }
    return url.origin;
  } catch {
    throw new CliError("INVALID_API_BASE", "ATTACH_API_BASE must be an http(s) origin", {
      exitCode: 2,
    });
  }
}

export function requireMatchingOrigin(ref: ParsedObjectRef, base: string): string {
  const expected = attachOrigin(base);
  if (ref.origin && ref.origin !== expected) {
    throw invalidRef(`object URL origin must match ${expected}`);
  }
  return ref.key;
}
