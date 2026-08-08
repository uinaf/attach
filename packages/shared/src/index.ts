export const ATTACH_HOST = "attach.uinaf.dev";
export const ATTACH_AUDIENCE = ATTACH_HOST;
export const ATTACH_API_BASE_DEFAULT = `https://${ATTACH_HOST}`;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const OBJECT_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;
export const PUTS_PER_HOUR = 60;
export const STORAGE_BYTES_LIMIT = 1024 * 1024 * 1024;
export const ENROLLMENTS_PER_DAY = 10;
export const AGENT_JWT_MAX_TTL_SEC = 120;
export const JTI_RETENTION_MS = 180_000;
export const KEY_PREFIX = "att_";
export const KEY_SECRET_BYTES = 16; // 128-bit
export const OBJECT_KEY_BYTES = 16; // 128-bit opaque

export const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "text/plain",
  "text/markdown",
  "application/json",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export type PrincipalKind = "user" | "app";

export function principalId(kind: PrincipalKind, id: string | number): string {
  return `${kind}:${id}`;
}

export function parsePrincipalId(value: string): { kind: PrincipalKind; id: string } | null {
  const match = /^(user|app):(.+)$/.exec(value);
  if (!match) return null;
  return { kind: match[1] as PrincipalKind, id: match[2]! };
}

export function agentIssuer(appId: string | number): string {
  return `attach:${appId}`;
}

export function parseAgentIssuer(iss: string): string | null {
  const match = /^attach:(\d+)$/.exec(iss);
  return match?.[1] ?? null;
}

export function isAllowedContentType(value: string): value is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

export function contentDisposition(contentType: string): string {
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return "inline";
  }
  return "attachment";
}

export function opaqueObjectPath(objectKey: string): string {
  return `/o/${objectKey}`;
}

export function objectUrl(base: string, objectKey: string): string {
  return `${base.replace(/\/$/, "")}${opaqueObjectPath(objectKey)}`;
}

/** Parse `/o/<key>` path or full attach object URL into opaque key. */
export function parseObjectRef(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const match = /^\/o\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    const match = /^\/o\/([A-Za-z0-9_-]+)$/.exec(trimmed);
    return match?.[1] ?? null;
  }
}

export type AgentPublicKey = {
  kid?: string;
  /** SPKI PEM or PKCS#1 PEM public key */
  pem: string;
};

export type AgentRegistryEntry = {
  app_id: string;
  slug: string;
  enabled?: boolean;
  public_keys: AgentPublicKey[];
};

export type PutResponse = {
  url: string;
  key: string;
  content_type: string;
  size: number;
  expires_at: string;
  digest: string;
};

export type EnrollResponse = {
  token: string;
  key_id: string;
  principal: string;
  stamp: string;
};

export {
  mintApiKey,
  parseApiKey,
  hashApiKeySecret,
  verifyApiKeySecret,
  mintObjectKey,
  digestBody,
  randomBytes,
  sha256Hex,
  timingSafeEqual,
} from "./crypto.ts";
export { validateContent } from "./mime.ts";
