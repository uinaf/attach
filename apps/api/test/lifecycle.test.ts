import { describe, expect, it } from "vite-plus/test";
import { hasRequiredObjectLifecycle } from "../scripts/lifecycle.ts";

function lifecycleRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "attach-object-ttl",
    enabled: true,
    conditions: { prefix: "" },
    deleteObjectsTransition: {
      condition: { type: "Age", maxAge: 760 * 24 * 60 * 60 },
    },
    ...overrides,
  };
}

describe("R2 lifecycle deploy gate", () => {
  it("accepts the Cloudflare envelope with an enabled all-object rule", () => {
    expect(hasRequiredObjectLifecycle({ result: { rules: [lifecycleRule()] } })).toBe(true);
  });

  it("rejects missing, narrow, disabled, or early deletion rules", () => {
    expect(hasRequiredObjectLifecycle({ result: { rules: [] } })).toBe(false);
    expect(
      hasRequiredObjectLifecycle({
        result: { rules: [lifecycleRule({ conditions: { prefix: "tmp/" } })] },
      }),
    ).toBe(false);
    expect(
      hasRequiredObjectLifecycle({ result: { rules: [lifecycleRule({ enabled: false })] } }),
    ).toBe(false);
    expect(
      hasRequiredObjectLifecycle({
        result: {
          rules: [
            lifecycleRule({
              deleteObjectsTransition: {
                condition: { type: "Age", maxAge: 759 * 24 * 60 * 60 },
              },
            }),
          ],
        },
      }),
    ).toBe(false);
  });

  it("rejects an overlapping early or date-based deletion rule", () => {
    const safe = lifecycleRule();
    const earlyPrefix = lifecycleRule({
      id: "early-prefix",
      conditions: { prefix: "a" },
      deleteObjectsTransition: {
        condition: { type: "Age", maxAge: 30 * 24 * 60 * 60 },
      },
    });
    const dated = lifecycleRule({
      id: "dated",
      deleteObjectsTransition: {
        condition: { type: "Date", date: "2030-01-01T00:00:00Z" },
      },
    });

    expect(hasRequiredObjectLifecycle({ result: { rules: [safe, earlyPrefix] } })).toBe(false);
    expect(hasRequiredObjectLifecycle({ result: { rules: [safe, dated] } })).toBe(false);
  });

  it("allows unrelated transitions and safe prefix deletion rules", () => {
    const safePrefix = lifecycleRule({ id: "safe-prefix", conditions: { prefix: "a" } });
    const abortOnly = {
      id: "abort-multipart",
      enabled: true,
      conditions: { prefix: "" },
      abortMultipartUploadsTransition: {
        condition: { type: "Age", maxAge: 7 * 24 * 60 * 60 },
      },
    };

    expect(
      hasRequiredObjectLifecycle({ result: { rules: [lifecycleRule(), safePrefix, abortOnly] } }),
    ).toBe(true);
  });
});
