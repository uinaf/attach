import {
  MAX_UPLOAD_BYTES,
  OBJECT_TTL_MS,
  contentDisposition,
  digestBody,
  mintObjectKey,
  objectUrl,
  previewUrl,
  validateContent,
  type PutResponse,
} from "@uinaf/attach-shared";
import { ApiError, claimPutQuota, recordPut, releasePutQuota, type AuthedKey } from "./db.ts";
import type { Env } from "./env.ts";
import { publicBase } from "./env.ts";

/**
 * Read at most MAX_UPLOAD_BYTES into one growable buffer (no chunk[] + second copy).
 * Does not trust Content-Length alone.
 */
async function readLimitedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new ApiError(400, "empty_body");

  const reader = request.body.getReader();
  let buf = new Uint8Array(Math.min(64 * 1024, MAX_UPLOAD_BYTES));
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > MAX_UPLOAD_BYTES) {
        throw new ApiError(413, "too_large");
      }
      if (total + value.byteLength > buf.byteLength) {
        const nextLen = Math.min(
          Math.max(buf.byteLength * 2, total + value.byteLength),
          MAX_UPLOAD_BYTES,
        );
        const next = new Uint8Array(nextLen);
        next.set(buf.subarray(0, total));
        buf = next;
      }
      buf.set(value, total);
      total += value.byteLength;
    }
  } catch (err) {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    throw err;
  }

  if (total === 0) throw new ApiError(400, "empty_body");
  return buf.subarray(0, total);
}

export async function handlePut(env: Env, request: Request, auth: AuthedKey): Promise<PutResponse> {
  const contentTypeHeader = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const body = await readLimitedBody(request);
  const head = body.subarray(0, 512);
  const contentType = validateContent(contentTypeHeader, head);
  if (!contentType) throw new ApiError(415, "unsupported_media");

  const now = Date.now();
  const { windowStart, reservationId } = await claimPutQuota(
    env.DB,
    auth.principal.id,
    body.byteLength,
    now,
  );

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
      reservationId,
    });

    const base = publicBase(env, request);
    return {
      url: objectUrl(base, objectKey),
      preview_url: previewUrl(base, objectKey),
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
    try {
      await releasePutQuota(env.DB, auth.principal.id, body.byteLength, windowStart, reservationId);
    } catch {
      // cleanup must not mask the original put/commit failure
    }
    throw err;
  }
}
