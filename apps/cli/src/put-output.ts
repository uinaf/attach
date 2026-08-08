import { basename } from "node:path";
import type { PutResponse } from "@uinaf/attach-shared";

export type PutOutputMode = "url" | "markdown" | "json";

/** Format put API response for CLI stdout. Default shares preview; markdown embeds raw. */
export function formatPutOutput(body: PutResponse, mode: PutOutputMode, filePath: string): string {
  if (mode === "json") {
    return JSON.stringify(body, null, 2);
  }
  if (mode === "markdown") {
    if (body.content_type.startsWith("image/")) {
      return `![${basename(filePath)}](${body.url})`;
    }
    return `[${basename(filePath)}](${body.url})`;
  }
  return body.preview_url;
}
