import { describe, expect, it } from "vite-plus/test";
import type { PutResponse } from "@uinaf/attach-shared";
import { formatPutOutput } from "../src/put-output.ts";

const sample: PutResponse = {
  url: "https://attach.uinaf.dev/o/abcdefghijklmnopqrstuv",
  preview_url: "https://attach.uinaf.dev/p/abcdefghijklmnopqrstuv",
  key: "abcdefghijklmnopqrstuv",
  content_type: "image/png",
  size: 10,
  expires_at: "2028-01-01T00:00:00.000Z",
  digest: "sha256:abc",
};

describe("put output", () => {
  it("defaults to preview url for sharing", () => {
    expect(formatPutOutput(sample, "preview", "shot.png")).toBe(sample.preview_url);
  });

  it("prints the raw object url when requested", () => {
    expect(formatPutOutput(sample, "url", "shot.png")).toBe(sample.url);
  });

  it("markdown embeds the raw object url", () => {
    expect(formatPutOutput(sample, "markdown", "shot.png")).toBe(`![shot.png](${sample.url})`);
  });

  it("json includes both urls", () => {
    const out = JSON.parse(formatPutOutput(sample, "json", "shot.png")) as PutResponse;
    expect(out.url).toBe(sample.url);
    expect(out.preview_url).toBe(sample.preview_url);
  });
});
