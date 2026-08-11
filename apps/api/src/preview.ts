import { objectUrl, opaqueObjectPath, previewUrl } from "@uinaf/attach-shared";
import { getLiveObject } from "./db.ts";
import type { Env } from "./env.ts";
import { publicBase } from "./env.ts";

const BRAND_OG = "https://cdn.uinaf.dev/images/uinaf-computer-og-image.png";
const BRAND_MARK = "https://cdn.uinaf.dev/images/uinaf-computer.png";

export type PreviewMeta = {
  object_key: string;
  content_type: string;
  size_bytes: number;
  digest: string;
  repo: string | null;
  pr: number | null;
  expires_at: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

function mediaBlock(contentType: string, rawPath: string): string {
  const src = escapeHtml(rawPath);
  if (contentType.startsWith("image/")) {
    return `<div class="stage stage--image motion" style="--i: 1"><img class="media" src="${src}" alt="attached image" /></div>`;
  }
  if (contentType.startsWith("video/")) {
    return `<div class="stage stage--video motion" style="--i: 1"><video class="media" controls playsinline src="${src}"></video></div>`;
  }
  return `<div class="stage stage--file motion" style="--i: 1">
      <p class="file-note">This attachment downloads as a file.</p>
      <a class="u-btn u-btn--primary" href="${src}">download</a>
    </div>`;
}

export function renderPreviewHtml(args: { base: string; meta: PreviewMeta }): string {
  const { base, meta } = args;
  const key = meta.object_key;
  const rawPath = opaqueObjectPath(key);
  const rawAbs = objectUrl(base, key);
  const pageAbs = previewUrl(base, key);
  const isImage = meta.content_type.startsWith("image/");
  const ogImage = isImage ? rawAbs : BRAND_OG;
  const title = `attach · ${key.slice(0, 8)}`;
  const expires = new Date(meta.expires_at).toISOString().slice(0, 10);
  const repoPr =
    meta.repo && meta.pr != null
      ? `<a class="u-link-plain" href="https://github.com/${escapeHtml(meta.repo)}/pull/${meta.pr}">${escapeHtml(meta.repo)}#${meta.pr}</a>`
      : meta.repo
        ? `<span>${escapeHtml(meta.repo)}</span>`
        : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="attach object preview" />
    <link rel="canonical" href="${escapeHtml(pageAbs)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="attach" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(meta.content_type)} · ${escapeHtml(formatBytes(meta.size_bytes))}" />
    <meta property="og:url" content="${escapeHtml(pageAbs)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta name="twitter:card" content="${isImage ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <link rel="icon" href="${BRAND_MARK}" type="image/png" />
    <link rel="stylesheet" href="https://cdn.uinaf.dev/fonts/berkeley-mono/variable/font.css" />
    <link rel="stylesheet" href="https://design.uinaf.dev/tokens.css" />
    <link rel="stylesheet" href="/preview.css" />
  </head>
  <body class="uinaf">
    <div class="page">
      <header class="u-topbar">
        <div class="u-shell-base u-topbar-row">
          <a class="u-topbar-mark" href="https://attach.uinaf.dev/">
            <img src="${BRAND_MARK}" alt="uinaf mark" />attach
          </a>
          <div class="u-topbar-actions chrome-actions">
            <a
              class="u-btn u-btn--sm u-btn--primary"
              href="${escapeHtml(rawPath)}"
              target="_blank"
              rel="noopener noreferrer"
              >raw ↗</a
            >
          </div>
        </div>
      </header>

      <main class="u-shell-base main">
        ${mediaBlock(meta.content_type, rawPath)}

        <section class="band motion" style="--i: 2">
          <span class="u-label">object</span>
          <dl class="facts">
            <div class="u-def"><dt class="u-def-term">type</dt><dd class="u-def-desc">${escapeHtml(meta.content_type)}</dd></div>
            <div class="u-def"><dt class="u-def-term">size</dt><dd class="u-def-desc">${escapeHtml(formatBytes(meta.size_bytes))}</dd></div>
            <div class="u-def"><dt class="u-def-term">expires</dt><dd class="u-def-desc">${escapeHtml(expires)}</dd></div>
            <div class="u-def"><dt class="u-def-term">digest</dt><dd class="u-def-desc digest">${escapeHtml(meta.digest.replace(/^sha256:/, "").slice(0, 12))}…</dd></div>
            ${repoPr ? `<div class="u-def"><dt class="u-def-term">pr</dt><dd class="u-def-desc">${repoPr}</dd></div>` : ""}
          </dl>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

function previewNotFound(): Response {
  return new Response("not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleGetPreview(
  env: Env,
  request: Request,
  objectKey: string,
): Promise<Response> {
  const meta = await getLiveObject(env.DB, objectKey);
  if (!meta) return previewNotFound();

  // Match /o/: require the R2 blob, not only a live D1 row.
  const blob = await env.BUCKET.head(objectKey);
  if (!blob) return previewNotFound();

  const html = renderPreviewHtml({
    base: publicBase(env, request),
    meta: {
      object_key: meta.object_key,
      content_type: meta.content_type,
      size_bytes: meta.size_bytes,
      digest: meta.digest,
      repo: meta.repo,
      pr: meta.pr,
      expires_at: meta.expires_at,
    },
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
