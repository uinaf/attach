import { ATTACH_AUDIENCE, type AgentRegistryEntry } from "@uinaf/attach-shared";

/** Binding Env comes from `wrangler types` (`worker-configuration.d.ts`). */
export type Env = Cloudflare.Env;

export function allowedUserIds(env: Env): Set<string> {
  return new Set(
    env.ALLOWED_GITHUB_USER_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function agentRegistry(env: Env): AgentRegistryEntry[] {
  if (!env.AGENT_REGISTRY?.trim()) return [];
  const parsed = JSON.parse(env.AGENT_REGISTRY) as AgentRegistryEntry[];
  if (!Array.isArray(parsed)) throw new Error("AGENT_REGISTRY must be a JSON array");
  return parsed;
}

export function publicBase(env: Env, request: Request): string {
  if (env.ATTACH_PUBLIC_BASE) return env.ATTACH_PUBLIC_BASE.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * JWT `aud` host for agent enroll — host of ATTACH_PUBLIC_BASE when set.
 * Never use the request Host. Unset/empty → published default host. Invalid → throw.
 */
export function agentAudience(env: Env): string {
  const raw = env.ATTACH_PUBLIC_BASE?.trim();
  if (!raw) return ATTACH_AUDIENCE;
  const normalized = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const host = new URL(normalized.replace(/\/$/, "")).host;
    if (!host) throw new Error("empty_host");
    return host;
  } catch {
    throw new Error("attach_public_base_invalid");
  }
}
