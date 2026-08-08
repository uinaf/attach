import { clientId } from "./config.ts";

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
};

export async function loginWithDeviceFlow(
  onPrompt: (uri: string, userCode: string) => void,
): Promise<string> {
  const id = clientId();
  const codeRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: id,
      scope: "read:user",
    }),
  });
  if (!codeRes.ok) {
    throw new Error(`device code request failed: ${codeRes.status}`);
  }
  const code = (await codeRes.json()) as DeviceCode;
  onPrompt(code.verification_uri, code.user_code);

  const started = Date.now();
  let intervalMs = Math.max(5, code.interval) * 1000;

  while (Date.now() - started < code.expires_in * 1000) {
    await sleep(intervalMs);
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: id,
        device_code: code.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const body = (await tokenRes.json()) as TokenResponse;
    if (body.access_token) return body.access_token;
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    throw new Error(body.error_description ?? body.error ?? "device_flow_failed");
  }
  throw new Error("device_flow_expired");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
