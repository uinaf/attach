import { JTI_RETENTION_MS } from "@uinaf/attach-shared";

/** Durable Object: atomic one-time jti claim with retention ≥ 180s. */
export class JtiStore {
  #state: DurableObjectState;
  #claimed = new Map<string, number>();

  constructor(state: DurableObjectState) {
    this.#state = state;
    void this.#state.blockConcurrencyWhile(async () => {
      const stored = await this.#state.storage.get<Map<string, number>>("claimed");
      if (stored) this.#claimed = new Map(stored);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const body = (await request.json()) as { jti?: string; now?: number };
    const jti = body.jti?.trim();
    if (!jti) return Response.json({ ok: false, error: "missing_jti" }, { status: 400 });

    const now = body.now ?? Date.now();
    this.#purge(now);

    if (this.#claimed.has(jti)) {
      return Response.json({ ok: false, error: "replay" }, { status: 409 });
    }

    this.#claimed.set(jti, now + JTI_RETENTION_MS);
    await this.#state.storage.put("claimed", this.#claimed);
    await this.#state.storage.setAlarm(now + JTI_RETENTION_MS);

    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    this.#purge(Date.now());
    await this.#state.storage.put("claimed", this.#claimed);
    if (this.#claimed.size > 0) {
      const next = Math.min(...this.#claimed.values());
      await this.#state.storage.setAlarm(next);
    }
  }

  #purge(now: number): void {
    for (const [jti, exp] of this.#claimed) {
      if (exp <= now) this.#claimed.delete(jti);
    }
  }
}

export async function claimJti(ns: DurableObjectNamespace, jti: string): Promise<"ok" | "replay"> {
  const id = ns.idFromName("global");
  const stub = ns.get(id);
  const res = await stub.fetch("https://jti/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jti, now: Date.now() }),
  });
  if (res.status === 409) return "replay";
  if (!res.ok) throw new Error(`jti claim failed: ${res.status}`);
  return "ok";
}
