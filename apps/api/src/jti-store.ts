import { DurableObject } from "cloudflare:workers";
import { JTI_RETENTION_MS } from "@uinaf/attach-shared";

/**
 * Per-jti Durable Object (idFromName(jti)): one claim flag in sync KV.
 * Avoids a global Map rewrite on every enroll (Workers DO best practice).
 */
export class JtiStore extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    const body = (await request.json()) as { jti?: string; now?: number };
    const jti = body.jti?.trim();
    if (!jti) {
      return Response.json({ ok: false, error: "missing_jti" }, { status: 400 });
    }
    const name = this.ctx.id.name;
    if (name != null && jti !== name) {
      return Response.json({ ok: false, error: "jti_mismatch" }, { status: 400 });
    }

    const now = body.now ?? Date.now();
    const exp = this.ctx.storage.kv.get<number>("exp");
    if (exp != null && exp > now) {
      return Response.json({ ok: false, error: "replay" }, { status: 409 });
    }

    const until = now + JTI_RETENTION_MS;
    this.ctx.storage.kv.put("exp", until);
    await this.ctx.storage.setAlarm(until);
    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const exp = this.ctx.storage.kv.get<number>("exp");
    if (exp != null && exp <= now) {
      this.ctx.storage.kv.delete("exp");
    }
  }
}
