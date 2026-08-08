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
});
