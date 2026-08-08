import { isAllowedContentType, type AllowedContentType } from "./index.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];
const MP4_FTYP = [0x66, 0x74, 0x79, 0x70];
const WEBM = [0x1a, 0x45, 0xdf, 0xa3];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<svg") || head.includes("<svg") || head.startsWith("<?xml");
}

/** Validate Content-Type against magic bytes where applicable. Reject SVG. */
export function validateContent(contentType: string, head: Uint8Array): AllowedContentType | null {
  if (!isAllowedContentType(contentType)) return null;
  if (looksLikeSvg(head)) return null;

  switch (contentType) {
    case "image/png":
      return startsWith(head, PNG) ? contentType : null;
    case "image/jpeg":
      return startsWith(head, JPEG) ? contentType : null;
    case "image/gif":
      return startsWith(head, GIF87) || startsWith(head, GIF89) ? contentType : null;
    case "image/webp":
      return startsWith(head, WEBP_RIFF) && startsWith(head, WEBP_WEBP, 8) ? contentType : null;
    case "video/mp4":
      return startsWith(head, MP4_FTYP, 4) ? contentType : null;
    case "video/webm":
      return startsWith(head, WEBM) ? contentType : null;
    case "text/plain":
    case "text/markdown":
    case "application/json":
      return contentType;
    default:
      return null;
  }
}
