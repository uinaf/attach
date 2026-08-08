import type { AgentRegistryEntry } from "@uinaf/attach-shared";

export type Env = {
  BUCKET: R2Bucket;
  DB: D1Database;
  JTI: DurableObjectNamespace;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  ALLOWED_GITHUB_USER_IDS: string;
  /** JSON array of AgentRegistryEntry */
  AGENT_REGISTRY: string;
  ATTACH_PUBLIC_BASE?: string;
};

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
