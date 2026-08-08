import { describe, expect, it } from "vite-plus/test";
import { JTI_RETENTION_MS } from "@uinaf/attach-shared";
import { JtiStore } from "../src/jti.ts";

function mockState(initial?: Map<string, number>) {
  let claimed = initial ? new Map(initial) : undefined;
  const storage = {
    async get<T>(key: string) {
      if (key === "claimed") return claimed as T | undefined;
      return undefined;
    },
    async put(key: string, value: unknown) {
      if (key === "claimed") claimed = value as Map<string, number>;
    },
    async setAlarm() {},
  };
  return {
    storage,
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    get claimed() {
      return claimed;
    },
  };
}

describe("JtiStore", () => {
  it("claims once and rejects replay", async () => {
    const state = mockState();
    const store = new JtiStore(state as unknown as DurableObjectState);
    // allow constructor hydrate
    await Promise.resolve();

    const now = 1_000_000;
    const first = await store.fetch(
      new Request("https://jti/claim", {
        method: "POST",
        body: JSON.stringify({ jti: "a", now }),
      }),
    );
    expect(first.status).toBe(200);

    const second = await store.fetch(
      new Request("https://jti/claim", {
        method: "POST",
        body: JSON.stringify({ jti: "a", now: now + 1 }),
      }),
    );
    expect(second.status).toBe(409);
  });

  it("allows reuse after retention expiry", async () => {
    const now = 5_000_000;
    const state = mockState(new Map([["old", now - 1]]));
    const store = new JtiStore(state as unknown as DurableObjectState);
    await Promise.resolve();

    const res = await store.fetch(
      new Request("https://jti/claim", {
        method: "POST",
        body: JSON.stringify({ jti: "old", now }),
      }),
    );
    expect(res.status).toBe(200);
    expect(state.claimed?.get("old")).toBe(now + JTI_RETENTION_MS);
  });
});
