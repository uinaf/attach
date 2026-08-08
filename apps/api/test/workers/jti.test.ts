import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { JTI_RETENTION_MS } from "@uinaf/attach-shared";
import { claimJti } from "../../src/jti.ts";

describe("JtiStore (workers)", () => {
  it("claims once per jti and rejects replay", async () => {
    const jti = `claim-${crypto.randomUUID()}`;
    expect(await claimJti(env.JTI, jti)).toBe("ok");
    expect(await claimJti(env.JTI, jti)).toBe("replay");
  });

  it("isolates distinct jtis", async () => {
    const a = `a-${crypto.randomUUID()}`;
    const b = `b-${crypto.randomUUID()}`;
    expect(await claimJti(env.JTI, a)).toBe("ok");
    expect(await claimJti(env.JTI, b)).toBe("ok");
    expect(await claimJti(env.JTI, a)).toBe("replay");
  });

  it("allows reclaim after retention window expires", async () => {
    const jti = `exp-${crypto.randomUUID()}`;
    const stub = env.JTI.get(env.JTI.idFromName(jti));
    // Use wall-clock so setAlarm lands in the future and cannot fire mid-test.
    const now = Date.now();

    await runInDurableObject(stub, async (instance) => {
      const first = await instance.fetch(
        new Request("https://jti/claim", {
          method: "POST",
          body: JSON.stringify({ jti, now }),
        }),
      );
      expect(first.status).toBe(200);

      const replay = await instance.fetch(
        new Request("https://jti/claim", {
          method: "POST",
          body: JSON.stringify({ jti, now: now + 1 }),
        }),
      );
      expect(replay.status).toBe(409);

      const after = await instance.fetch(
        new Request("https://jti/claim", {
          method: "POST",
          body: JSON.stringify({ jti, now: now + JTI_RETENTION_MS }),
        }),
      );
      expect(after.status).toBe(200);
    });
  });

  it("alarm clears expired claim storage", async () => {
    const jti = `alarm-${crypto.randomUUID()}`;
    const stub = env.JTI.get(env.JTI.idFromName(jti));

    await runInDurableObject(stub, async (instance, state) => {
      const res = await instance.fetch(
        new Request("https://jti/claim", {
          method: "POST",
          body: JSON.stringify({ jti, now: Date.now() }),
        }),
      );
      expect(res.status).toBe(200);
      state.storage.kv.put("exp", Date.now() - 1);
      await instance.alarm();
      expect(state.storage.kv.get<number>("exp")).toBeUndefined();
    });
  });
});
