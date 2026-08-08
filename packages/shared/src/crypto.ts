import { KEY_PREFIX, KEY_SECRET_BYTES, OBJECT_KEY_BYTES } from "./index.ts";

const textEncoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes);
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export type ApiKeyMaterial = {
  token: string;
  keyId: string;
  secret: Uint8Array;
};

export function mintApiKey(): ApiKeyMaterial {
  const keyId = bytesToBase64Url(randomBytes(8));
  const secret = randomBytes(KEY_SECRET_BYTES);
  const token = `${KEY_PREFIX}${keyId}_${bytesToBase64Url(secret)}`;
  return { token, keyId, secret };
}

export function parseApiKey(token: string): { keyId: string; secret: Uint8Array } | null {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const rest = token.slice(KEY_PREFIX.length);
  const idx = rest.indexOf("_");
  if (idx <= 0) return null;
  const keyId = rest.slice(0, idx);
  const secretPart = rest.slice(idx + 1);
  if (!keyId || !secretPart) return null;
  try {
    const secret = base64UrlToBytes(secretPart);
    if (secret.length !== KEY_SECRET_BYTES) return null;
    return { keyId, secret };
  } catch {
    return null;
  }
}

export async function hashApiKeySecret(secret: Uint8Array): Promise<Uint8Array> {
  return sha256(secret);
}

export async function verifyApiKeySecret(secret: Uint8Array, hash: Uint8Array): Promise<boolean> {
  const digest = await hashApiKeySecret(secret);
  return timingSafeEqual(digest, hash);
}

export function mintObjectKey(): string {
  return bytesToBase64Url(randomBytes(OBJECT_KEY_BYTES));
}

export async function digestBody(bytes: Uint8Array): Promise<string> {
  return `sha256:${await sha256Hex(bytes)}`;
}

export function utf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}
