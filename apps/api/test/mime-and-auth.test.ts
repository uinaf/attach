import { describe, expect, it } from "vite-plus/test";
import {
  agentIssuer,
  mintApiKey,
  parseApiKey,
  hashApiKeySecret,
  verifyApiKeySecret,
  validateContent,
  parseObjectRef,
} from "@uinaf/attach-shared";
import { parseAgentIssuer } from "@uinaf/attach-shared";

describe("contract locks", () => {
  it("uses attach: app issuer prefix", () => {
    expect(agentIssuer("4455325")).toBe("attach:4455325");
    expect(parseAgentIssuer("attach:4455325")).toBe("4455325");
    expect(parseAgentIssuer("4455325")).toBeNull();
  });

  it("mints att_ keys with constant-time verify shape", async () => {
    const a = mintApiKey();
    const b = mintApiKey();
    expect(a.token.startsWith("att_")).toBe(true);
    expect(a.keyId).not.toBe(b.keyId);
    const parsed = parseApiKey(a.token)!;
    const hash = await hashApiKeySecret(a.secret);
    expect(await verifyApiKeySecret(parsed.secret, hash)).toBe(true);
    expect(await verifyApiKeySecret(b.secret, hash)).toBe(false);
  });

  it("rejects svg and accepts png", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateContent("image/png", png)).toBe("image/png");
    expect(
      validateContent(
        "text/plain",
        new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      ),
    ).toBeNull();
  });

  it("parses object delete refs for raw and preview urls", () => {
    expect(parseObjectRef("https://attach.uinaf.dev/o/abc_def-0123456789ABCDEF")).toBe(
      "abc_def-0123456789ABCDEF",
    );
    expect(parseObjectRef("https://attach.uinaf.dev/p/abc_def-0123456789ABCDEF")).toBe(
      "abc_def-0123456789ABCDEF",
    );
  });
});
