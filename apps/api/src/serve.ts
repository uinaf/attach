import { contentDisposition, parseObjectRef } from "@uinaf/attach-shared";
import { getLiveObject, softDeleteObject, type AuthedKey } from "./db.ts";
import type { Env } from "./env.ts";
import { ApiError } from "./db.ts";

const OBJECT_CSP = "sandbox; default-src 'none'";

function objectHeaders(contentType: string, size: number, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", contentDisposition(contentType));
  headers.set("Content-Security-Policy", OBJECT_CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");
  if (!headers.has("Content-Length") && size >= 0) {
    headers.set("Content-Length", String(size));
  }
  return headers;
}

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const startRaw = match[1];
  const endRaw = match[2];
  let start = startRaw ? Number(startRaw) : NaN;
  let end = endRaw ? Number(endRaw) : NaN;
  if (!startRaw && endRaw) {
    // suffix length
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) return "invalid";
    if (!Number.isFinite(end)) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return "invalid";
  end = Math.min(end, size - 1);
  return { start, end };
}

export async function handleGetObject(
  env: Env,
  request: Request,
  objectKey: string,
): Promise<Response> {
  const meta = await getLiveObject(env.DB, objectKey);
  if (!meta) return new Response("not found", { status: 404 });

  const range = parseRange(request.headers.get("range"), meta.size_bytes);
  if (range === "invalid") {
    return new Response("invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${meta.size_bytes}` },
    });
  }

  if (range) {
    const obj = await env.BUCKET.get(objectKey, {
      range: { offset: range.start, length: range.end - range.start + 1 },
    });
    if (!obj) return new Response("not found", { status: 404 });
    const headers = objectHeaders(meta.content_type, range.end - range.start + 1, {
      "Content-Range": `bytes ${range.start}-${range.end}/${meta.size_bytes}`,
    });
    return new Response(obj.body, { status: 206, headers });
  }

  const obj = await env.BUCKET.get(objectKey);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, {
    status: 200,
    headers: objectHeaders(meta.content_type, meta.size_bytes),
  });
}

export async function handleDeleteObject(
  env: Env,
  auth: AuthedKey,
  ref: string,
): Promise<Response> {
  const objectKey = parseObjectRef(ref);
  if (!objectKey) throw new ApiError(400, "bad_object_ref");

  const meta = await getLiveObject(env.DB, objectKey);
  if (!meta || meta.principal_id !== auth.principal.id) {
    throw new ApiError(404, "not_found");
  }

  // Delete R2 first so a crash never leaves a billed orphan after D1 soft-delete.
  await env.BUCKET.delete(objectKey);
  await softDeleteObject(env.DB, objectKey, auth.principal.id);
  // Object may already be gone from a prior partial delete; treat as success.
  return Response.json({
    deleted: true,
    key: objectKey,
  });
}
