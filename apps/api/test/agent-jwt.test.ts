import { describe, expect, it } from "vite-plus/test";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { AgentAuthError, verifyAgentJwt } from "../src/agent-jwt.ts";
import type { Env } from "../src/env.ts";
import { agentAudience } from "../src/env.ts";
import { ATTACH_AUDIENCE, JTI_RETENTION_MS } from "@uinaf/attach-shared";

function jtiNamespace(store: Map<string, number>): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const name = id.toString();
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          const raw = typeof init?.body === "string" ? init.body : "{}";
          const body = JSON.parse(raw) as { jti?: string; now?: number };
          const jti = body.jti?.trim();
          if (!jti) return Response.json({ ok: false, error: "missing_jti" }, { status: 400 });
          if (jti !== name) {
            return Response.json({ ok: false, error: "jti_mismatch" }, { status: 400 });
          }
          const now = body.now ?? Date.now();
          for (const [k, exp] of store) {
            if (exp <= now) store.delete(k);
          }
          if (store.has(jti)) {
            return Response.json({ ok: false, error: "replay" }, { status: 409 });
          }
          store.set(jti, now + JTI_RETENTION_MS);
          return Response.json({ ok: true });
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

async function mint(
  privateKey: CryptoKey,
  claims: { aud: string; appId: string; jti: string; ttlSec?: number },
) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSec ?? 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(`attach:${claims.appId}`)
    .setAudience(claims.aud)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setJti(claims.jti)
    .sign(privateKey);
}

describe("agentAudience", () => {
  it("uses ATTACH_PUBLIC_BASE host when set", () => {
    const env = { ATTACH_PUBLIC_BASE: "https://attach.example.test/" } as Env;
    expect(agentAudience(env)).toBe("attach.example.test");
  });

  it("falls back to ATTACH_AUDIENCE when ATTACH_PUBLIC_BASE is unset", () => {
    const env = {} as Env;
    expect(agentAudience(env)).toBe(ATTACH_AUDIENCE);
  });

  it("accepts scheme-less hosts and rejects garbage", () => {
    expect(agentAudience({ ATTACH_PUBLIC_BASE: "attach.example.test" } as Env)).toBe(
      "attach.example.test",
    );
    expect(() => agentAudience({ ATTACH_PUBLIC_BASE: "://" } as Env)).toThrow(
      "attach_public_base_invalid",
    );
  });
});

describe("verifyAgentJwt", () => {
  it("accepts a valid token and rejects replay / wrong audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const claimed = new Map<string, number>();
    const env = {
      AGENT_REGISTRY: JSON.stringify([
        {
          app_id: "99",
          slug: "attach-bot",
          public_keys: [{ pem }],
        },
      ]),
      JTI: jtiNamespace(claimed),
    } as Env;

    const good = await mint(privateKey, {
      aud: "attach.example.test",
      appId: "99",
      jti: "jti-1",
    });
    const identity = await verifyAgentJwt(env, good, "attach.example.test");
    expect(identity.appId).toBe("99");
    expect(identity.slug).toBe("attach-bot");

    await expect(verifyAgentJwt(env, good, "attach.example.test")).rejects.toBeInstanceOf(
      AgentAuthError,
    );
    await expect(verifyAgentJwt(env, good, "attach.example.test")).rejects.toMatchObject({
      code: "jwt_replay",
    });

    const wrongAud = await mint(privateKey, {
      aud: "other.host",
      appId: "99",
      jti: "jti-2",
    });
    await expect(verifyAgentJwt(env, wrongAud, "attach.example.test")).rejects.toMatchObject({
      code: "jwt_verify_failed",
    });
  });

  it("rejects unregistered agents and overlong TTL", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const env = {
      AGENT_REGISTRY: JSON.stringify([
        { app_id: "1", slug: "a", public_keys: [{ pem }], enabled: false },
      ]),
      JTI: jtiNamespace(new Map()),
    } as Env;

    const token = await mint(privateKey, { aud: "h", appId: "1", jti: "x" });
    await expect(verifyAgentJwt(env, token, "h")).rejects.toMatchObject({
      code: "agent_not_registered",
    });

    const envOk = {
      AGENT_REGISTRY: JSON.stringify([{ app_id: "1", slug: "a", public_keys: [{ pem }] }]),
      JTI: jtiNamespace(new Map()),
    } as Env;
    const longTtl = await mint(privateKey, { aud: "h", appId: "1", jti: "y", ttlSec: 121 });
    await expect(verifyAgentJwt(envOk, longTtl, "h")).rejects.toMatchObject({ code: "jwt_ttl" });
  });

  it("rejects whitespace-only jti and treats padded jti as the trimmed key", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const pem = await exportSPKI(publicKey);
    const claimed = new Map<string, number>();
    const env = {
      AGENT_REGISTRY: JSON.stringify([{ app_id: "1", slug: "a", public_keys: [{ pem }] }]),
      JTI: jtiNamespace(claimed),
    } as Env;

    const blank = await mint(privateKey, { aud: "h", appId: "1", jti: "   " });
    await expect(verifyAgentJwt(env, blank, "h")).rejects.toMatchObject({
      code: "jwt_jti_missing",
    });

    const padded = await mint(privateKey, { aud: "h", appId: "1", jti: "  pad  " });
    await verifyAgentJwt(env, padded, "h");
    expect(claimed.has("pad")).toBe(true);

    const plain = await mint(privateKey, { aud: "h", appId: "1", jti: "pad" });
    await expect(verifyAgentJwt(env, plain, "h")).rejects.toMatchObject({ code: "jwt_replay" });
  });
});
