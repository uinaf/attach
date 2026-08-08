import type { JtiStore } from "./jti-store.ts";

export async function claimJti(
  ns: DurableObjectNamespace<JtiStore>,
  jti: string,
): Promise<"ok" | "replay"> {
  const key = jti.trim();
  if (!key) throw new Error("jti claim failed: empty_jti");
  const stub = ns.get(ns.idFromName(key));
  const res = await stub.fetch("https://jti/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jti: key, now: Date.now() }),
  });
  if (res.status === 409) return "replay";
  if (!res.ok) throw new Error(`jti claim failed: ${res.status}`);
  return "ok";
}
