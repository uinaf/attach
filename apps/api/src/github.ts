import type { Env } from "./env.ts";

export type GitHubTokenIdentity = {
  userId: string;
  login: string;
};

/** Validate App user token via check-token; never persist the token. */
export async function checkAppUserToken(
  env: Env,
  accessToken: string,
): Promise<GitHubTokenIdentity> {
  const basic = btoa(`${env.GITHUB_APP_CLIENT_ID}:${env.GITHUB_APP_CLIENT_SECRET}`);
  const res = await fetch(`https://api.github.com/applications/${env.GITHUB_APP_CLIENT_ID}/token`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "User-Agent": "uinaf-attach",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) {
    throw new GitHubAuthError(401, "github_token_invalid");
  }

  const body = (await res.json()) as {
    user?: { id?: number; login?: string };
  };
  const userId = body.user?.id;
  const login = body.user?.login;
  if (userId == null || !login) {
    throw new GitHubAuthError(401, "github_identity_missing");
  }
  return { userId: String(userId), login };
}

export class GitHubAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
