import { describe, expect, it } from "vite-plus/test";
import {
  agentIssuer,
  objectUrl,
  parseAgentIssuer,
  parseApiKey,
  parseObjectRef,
  principalId,
} from "../src/index.ts";
import { mintApiKey, mintObjectKey, verifyApiKeySecret, hashApiKeySecret } from "../src/crypto.ts";
import { validateContent } from "../src/mime.ts";

describe("principals", () => {
  it("formats and parses principal ids", () => {
    expect(principalId("user", 9790196)).toBe("user:9790196");
    expect(principalId("app", "4455325")).toBe("app:4455325");
  });

  it("parses agent issuer", () => {
    expect(agentIssuer(4455325)).toBe("attach:4455325");
    expect(parseAgentIssuer("attach:4455325")).toBe("4455325");
    expect(parseAgentIssuer("4455325")).toBeNull();
  });
});

describe("api keys", () => {
  it("mints and verifies att_ keys", async () => {
    // base64url keyIds often contain '_'; separator must still round-trip.
    for (let i = 0; i < 50; i++) {
      const minted = mintApiKey();
      expect(minted.token.startsWith("att_")).toBe(true);
      expect(minted.token.includes(".")).toBe(true);
      const parsed = parseApiKey(minted.token);
      expect(parsed?.keyId).toBe(minted.keyId);
      const hash = await hashApiKeySecret(minted.secret);
      expect(await verifyApiKeySecret(parsed!.secret, hash)).toBe(true);
    }
  });

  it("still parses legacy underscore-separated tokens", async () => {
    const minted = mintApiKey();
    const secretB64 = minted.token.slice(minted.token.indexOf(".") + 1);
    const legacy = `att_${minted.keyId}_${secretB64}`;
    const parsed = parseApiKey(legacy);
    expect(parsed?.keyId).toBe(minted.keyId);
    const hash = await hashApiKeySecret(minted.secret);
    expect(await verifyApiKeySecret(parsed!.secret, hash)).toBe(true);
  });
});

describe("objects", () => {
  it("builds and parses object refs", () => {
    const key = mintObjectKey();
    const url = objectUrl("https://attach.uinaf.dev", key);
    expect(parseObjectRef(url)).toBe(key);
    expect(parseObjectRef(`/o/${key}`)).toBe(key);
    expect(parseObjectRef(key)).toBe(key);
  });
});

describe("mime", () => {
  it("accepts png magic and rejects svg", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(validateContent("image/png", png)).toBe("image/png");
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(validateContent("image/png", svg)).toBeNull();
    expect(validateContent("image/svg+xml", svg)).toBeNull();
  });
});
