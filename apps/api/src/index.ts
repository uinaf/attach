import { principalId, type EnrollResponse } from "@uinaf/attach-shared";
import { verifyAgentJwt, AgentAuthError } from "./agent-jwt.ts";
import { ApiError, EnrollError, authenticate, ensurePrincipal, mintKeyForPrincipal } from "./db.ts";
import type { Env } from "./env.ts";
import { agentAudience, allowedUserIds } from "./env.ts";
import { checkAppUserToken, GitHubAuthError } from "./github.ts";
import { handleGetPreview } from "./preview.ts";
import { handleDeleteObject, handleGetObject } from "./serve.ts";
export { JtiStore } from "./jti.ts";
import { handlePut } from "./upload.ts";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function error(status: number, code: string): Response {
  return json({ error: code }, status);
}

function requestId(): string {
  return crypto.randomUUID();
}

async function handleEnrollHuman(env: Env, request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return error(401, "missing_token");
  const accessToken = auth.slice("Bearer ".length).trim();
  if (!accessToken) return error(401, "missing_token");

  try {
    const identity = await checkAppUserToken(env, accessToken);
    if (!allowedUserIds(env).has(identity.userId)) {
      return error(403, "user_not_allowlisted");
    }
    const principal = await ensurePrincipal(
      env.DB,
      principalId("user", identity.userId),
      "user",
      identity.login,
    );
    const minted = await mintKeyForPrincipal(env.DB, principal);
    const body: EnrollResponse = {
      token: minted.token,
      key_id: minted.keyId,
      principal: principal.id,
      stamp: identity.login,
    };
    return json(body);
  } catch (err) {
    if (err instanceof GitHubAuthError) return error(err.status, err.code);
    if (err instanceof EnrollError) return error(err.status, err.code);
    console.error("enroll_human_failed", requestId(), String(err));
    return error(500, "enroll_failed");
  }
}

async function handleEnrollAgent(env: Env, request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return error(401, "missing_token");
  const jwt = auth.slice("Bearer ".length).trim();
  if (!jwt) return error(401, "missing_token");

  try {
    const identity = await verifyAgentJwt(env, jwt, agentAudience(env));
    const principal = await ensurePrincipal(
      env.DB,
      principalId("app", identity.appId),
      "app",
      identity.stamp,
    );
    const minted = await mintKeyForPrincipal(env.DB, principal);
    const body: EnrollResponse = {
      token: minted.token,
      key_id: minted.keyId,
      principal: principal.id,
      stamp: identity.stamp,
    };
    return json(body);
  } catch (err) {
    if (err instanceof AgentAuthError) return error(err.status, err.code);
    if (err instanceof EnrollError) return error(err.status, err.code);
    console.error("enroll_agent_failed", requestId(), String(err));
    return error(500, "enroll_failed");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === "/v1/health" && request.method === "GET") {
        return json({ ok: true, service: "attach" });
      }

      if (pathname === "/v1/enroll/human" && request.method === "POST") {
        return handleEnrollHuman(env, request);
      }

      if (pathname === "/v1/enroll/agent" && request.method === "POST") {
        return handleEnrollAgent(env, request);
      }

      if (pathname === "/v1/objects" && request.method === "PUT") {
        const auth = await authenticate(env, request.headers.get("authorization"));
        if (!auth) return error(401, "unauthorized");
        const put = await handlePut(env, request, auth);
        return json(put, 201);
      }

      if (pathname.startsWith("/v1/objects/") && request.method === "DELETE") {
        const auth = await authenticate(env, request.headers.get("authorization"));
        if (!auth) return error(401, "unauthorized");
        const ref = pathname.slice("/v1/objects/".length);
        return handleDeleteObject(env, auth, ref);
      }

      if (pathname.startsWith("/o/") && request.method === "GET") {
        const key = pathname.slice("/o/".length);
        if (!key || key.includes("/")) return error(404, "not_found");
        return handleGetObject(env, request, key);
      }

      if (pathname.startsWith("/o/") && request.method === "HEAD") {
        const key = pathname.slice("/o/".length);
        if (!key || key.includes("/")) return error(404, "not_found");
        const res = await handleGetObject(env, request, key);
        return new Response(null, { status: res.status, headers: res.headers });
      }

      if (pathname.startsWith("/p/") && request.method === "GET") {
        const key = pathname.slice("/p/".length);
        if (!key || key.includes("/")) return error(404, "not_found");
        return handleGetPreview(env, request, key);
      }

      // Landing/static assets are served by the Workers assets pipeline
      // (run_worker_first only invokes this script for /v1/*, /o/*, /p/*).
      return error(404, "not_found");
    } catch (err) {
      if (err instanceof ApiError) return error(err.status, err.code);
      console.error("request_failed", requestId(), String(err));
      return error(500, "internal");
    }
  },
};
