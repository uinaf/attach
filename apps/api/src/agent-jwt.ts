import {
  AGENT_JWT_MAX_TTL_SEC,
  parseAgentIssuer,
  type AgentRegistryEntry,
} from "@uinaf/attach-shared";
import { importSPKI, jwtVerify, errors as joseErrors } from "jose";
import { claimJti } from "./jti.ts";
import type { Env } from "./env.ts";
import { agentRegistry } from "./env.ts";

export type AgentIdentity = {
  appId: string;
  slug: string;
  stamp: string;
};

function decodeUnverifiedIss(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as { iss?: string };
    return typeof payload.iss === "string" ? payload.iss : null;
  } catch {
    return null;
  }
}

function findAgent(registry: AgentRegistryEntry[], appId: string): AgentRegistryEntry | null {
  return registry.find((e) => String(e.app_id) === appId) ?? null;
}

/** Verify agent JWT with pinned pubkey for app_id; claim jti atomically. */
export async function verifyAgentJwt(
  env: Env,
  token: string,
  audience: string,
): Promise<AgentIdentity> {
  const iss = decodeUnverifiedIss(token);
  if (!iss) throw new AgentAuthError(401, "jwt_malformed");
  const appId = parseAgentIssuer(iss);
  if (!appId) throw new AgentAuthError(401, "jwt_iss_invalid");

  const entry = findAgent(agentRegistry(env), appId);
  if (!entry || entry.enabled === false) {
    throw new AgentAuthError(401, "agent_not_registered");
  }
  if (!entry.public_keys?.length) {
    throw new AgentAuthError(401, "agent_keys_missing");
  }

  let lastError: unknown;
  for (const key of entry.public_keys) {
    try {
      const cryptoKey = await importSPKI(key.pem, "RS256");
      const { payload, protectedHeader } = await jwtVerify(token, cryptoKey, {
        audience,
        issuer: `attach:${appId}`,
        algorithms: ["RS256"],
        maxTokenAge: `${AGENT_JWT_MAX_TTL_SEC}s`,
      });

      if (protectedHeader.alg !== "RS256") {
        throw new AgentAuthError(401, "jwt_alg");
      }
      if (protectedHeader.jku || (protectedHeader as { jwk?: unknown }).jwk) {
        throw new AgentAuthError(401, "jwt_remote_key");
      }
      if (key.kid && protectedHeader.kid && key.kid !== protectedHeader.kid) {
        continue;
      }

      const jti = typeof payload.jti === "string" ? payload.jti : null;
      if (!jti) throw new AgentAuthError(401, "jwt_jti_missing");

      const iat = payload.iat;
      const exp = payload.exp;
      if (iat == null || exp == null) throw new AgentAuthError(401, "jwt_time_missing");
      if (exp - iat > AGENT_JWT_MAX_TTL_SEC) {
        throw new AgentAuthError(401, "jwt_ttl");
      }

      const claim = await claimJti(env.JTI, jti);
      if (claim === "replay") throw new AgentAuthError(401, "jwt_replay");

      return {
        appId,
        slug: entry.slug,
        stamp: `${entry.slug}[bot]`,
      };
    } catch (err) {
      if (err instanceof AgentAuthError) throw err;
      lastError = err;
      if (err instanceof joseErrors.JWTExpired) {
        throw new AgentAuthError(401, "jwt_expired");
      }
      // try next overlapping key
    }
  }

  throw new AgentAuthError(
    401,
    lastError instanceof Error ? "jwt_verify_failed" : "jwt_verify_failed",
  );
}

export class AgentAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
