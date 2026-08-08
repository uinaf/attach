import { describe, expect, it } from "vite-plus/test";
import { objectUrl, previewUrl } from "@uinaf/attach-shared";
import { renderPreviewHtml } from "../src/preview.ts";

describe("preview pages", () => {
  const key = "abcdefghijklmnopqrstuv";
  const base = "https://attach.uinaf.dev";

  it("renders image preview with raw embed and OG pointing at /o/", () => {
    const html = renderPreviewHtml({
      base,
      meta: {
        object_key: key,
        content_type: "image/png",
        size_bytes: 1024,
        digest: "sha256:abcdef0123456789deadbeef",
        repo: "uinaf/attach",
        pr: 2,
        expires_at: Date.parse("2028-01-01T00:00:00.000Z"),
      },
    });

    expect(html).toContain(`src="/o/${key}"`);
    expect(html).toContain(`<img class="media"`);
    expect(html).toContain(`content="${objectUrl(base, key)}"`);
    expect(html).toContain(`href="${previewUrl(base, key)}"`);
    expect(html).toContain("uinaf/attach#2");
    expect(html).toContain('href="/preview.css"');
    expect(html).not.toContain("<script");
  });

  it("renders file download stage for text objects", () => {
    const html = renderPreviewHtml({
      base,
      meta: {
        object_key: key,
        content_type: "text/plain",
        size_bytes: 12,
        digest: "sha256:aaaaaaaaaaaaaaaa",
        repo: null,
        pr: null,
        expires_at: Date.parse("2028-01-01T00:00:00.000Z"),
      },
    });

    expect(html).toContain("stage--file");
    expect(html).toContain("download");
    expect(html).toContain(`href="/o/${key}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("raw ↗");
    expect(html).not.toContain('<img class="media"');
  });

  it("escapes hostile repo metadata", () => {
    const html = renderPreviewHtml({
      base,
      meta: {
        object_key: key,
        content_type: "image/png",
        size_bytes: 1,
        digest: "sha256:bb",
        repo: "uinaf/<script>alert(1)</script>",
        pr: 1,
        expires_at: Date.now() + 1000,
      },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
