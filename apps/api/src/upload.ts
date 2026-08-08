import {
  MAX_UPLOAD_BYTES,
  OBJECT_TTL_MS,
  contentDisposition,
  digestBody,
  mintObjectKey,
  objectUrl,
  validateContent,
  type PutResponse,
} from "@uinaf/attach-shared";
import { ApiError, claimPutQuota, recordPut, releasePutQuota, type AuthedKey } from "./db.ts";
import type { Env } from "./env.ts";
import { publicBase } from "./env.ts";

async function readLimitedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new ApiError(400, "empty_body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new ApiError(413, "too_large");
    }
    chunks.push(value);
  }

  if (total === 0) throw new ApiError(400, "empty_body");

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function handlePut(env: Env, request: Request, auth: AuthedKey): Promise<PutResponse> {
  const contentTypeHeader = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const body = await readLimitedBody(request);
  const head = body.slice(0, 512);
  const contentType = validateContent(contentTypeHeader, head);
  if (!contentType) throw new ApiError(415, "unsupported_media");

  const now = Date.now();
  const { windowStart } = await claimPutQuota(env.DB, auth.principal.id, body.byteLength, now);

  const expiresAt = now + OBJECT_TTL_MS;
  const repo = request.headers.get("x-attach-repo");
  const prRaw = request.headers.get("x-attach-pr");
  const pr = prRaw && /^\d+$/.test(prRaw) ? Number(prRaw) : null;

  let objectKey: string | undefined;
  try {
    objectKey = mintObjectKey();
    const digest = await digestBody(body);

    await env.BUCKET.put(objectKey, body, {
      httpMetadata: {
        contentType,
        contentDisposition: contentDisposition(contentType),
      },
      customMetadata: {
        principal: auth.principal.id,
        key_id: auth.keyId,
        digest,
        expires_at: String(expiresAt),
      },
    });

    await recordPut(env.DB, {
      objectKey,
      principalId: auth.principal.id,
      keyId: auth.keyId,
      sizeBytes: body.byteLength,
      contentType,
      digest,
      repo,
      pr,
      now,
      expiresAt,
    });

    return {
      url: objectUrl(publicBase(env, request), objectKey),
      key: objectKey,
      content_type: contentType,
      size: body.byteLength,
      expires_at: new Date(expiresAt).toISOString(),
      digest,
    };
  } catch (err) {
    if (objectKey) {
      try {
        await env.BUCKET.delete(objectKey);
      } catch {
        // still release quota below
      }
    }
    await releasePutQuota(env.DB, auth.principal.id, body.byteLength, windowStart);
    throw err;
  }
}
