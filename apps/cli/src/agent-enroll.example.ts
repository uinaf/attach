/**
 * Example helper for App agents (e.g. Glitch). Not wired into the CLI binary.
 *
 * Sign with App PEM:
 *   iss=attach:<app_id> aud=attach.uinaf.dev exp<=iat+120 jti=uuid alg=RS256
 * Then POST /v1/enroll/agent with Authorization: Bearer <jwt>
 * On 401 from put, re-enroll at most once.
 */
export async function enrollAgent(apiBase: string, jwt: string): Promise<string> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/enroll/agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
  });
  const body = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !body.token) {
    throw new Error(body.error ?? `enroll failed: ${res.status}`);
  }
  return body.token;
}
