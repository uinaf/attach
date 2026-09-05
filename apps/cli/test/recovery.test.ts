import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  checkInputs,
  checkPackage,
  checkProvenance,
  checkRelease,
  lookup,
  lookupPublished,
} from "../scripts/recover-0.6.2.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("post-publication registry visibility", () => {
  it("waits five seconds between confirmed 404s and stops when visible", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ version: "0.6.2" }));
    vi.stubGlobal("fetch", fetch);
    const result = lookupPublished("https://registry.npmjs.org/fixture");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(result).resolves.toEqual({ version: "0.6.2" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops after twelve confirmed missing responses", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const result = lookupPublished("https://registry.npmjs.org/fixture");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(12);
  });

  for (const status of [401, 403, 429, 500, 503]) {
    it(`does not retry HTTP ${status}`, async () => {
      const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(lookupPublished("https://registry.npmjs.org/fixture")).rejects.toThrow(
        `HTTP ${status}`,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }

  it("does not retry malformed successful responses", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    await expect(lookupPublished("https://registry.npmjs.org/fixture")).rejects.toThrow(
      "Expected object",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry network failures", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetch);
    await expect(lookupPublished("https://registry.npmjs.org/fixture")).rejects.toThrow(
      "network unavailable",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("fixed release recovery", () => {
  it("allows only the four recovery files to differ from the tag", () => {
    expect(() =>
      checkInputs([
        ".github/workflows/release.yml",
        "docs/releasing.md",
        "apps/cli/scripts/recover-0.6.2.ts",
        "apps/cli/test/recovery.test.ts",
      ]),
    ).not.toThrow();
    for (const file of [
      "package.json",
      "pnpm-lock.yaml",
      "src/lint/index.ts",
      "scripts/build.ts",
      "assets/logo.svg",
      "test/other.test.ts",
      "scripts/../package.json",
    ]) {
      expect(() => checkInputs([file])).toThrow("Package input changed");
    }
  });

  it("accepts only a confirmed 404 as absence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(lookup("https://registry.npmjs.org/fixture")).resolves.toBeNull();
  });

  for (const status of [401, 403, 429, 500, 503]) {
    it(`stops on HTTP ${status} instead of republishing`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
      await expect(lookup("https://registry.npmjs.org/fixture")).rejects.toThrow(`HTTP ${status}`);
    });
  }

  it("preserves network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    await expect(lookup("https://registry.npmjs.org/fixture")).rejects.toThrow(
      "network unavailable",
    );
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    await expect(lookup("https://registry.npmjs.org/fixture")).rejects.toThrow("Expected object");
  });

  it("requires matching version, artifact integrity and provenance", () => {
    const pkg = {
      name: "@uinaf/attach-cli",
      version: "0.6.2",
      gitHead: "recovery-sha",
      dist: {
        integrity: "sha512-fixture",
        attestations: { provenance: { predicateType: "https://slsa.dev/provenance/v1" } },
      },
    };
    expect(() => checkPackage(pkg, "sha512-fixture", "recovery-sha")).not.toThrow();
    expect(() => checkPackage(pkg, "sha512-fixture", "different-sha")).toThrow(
      "npm gitHead differs",
    );
    expect(() => checkPackage(pkg, "sha512-other")).toThrow("Published tarball differs");
    expect(() => checkPackage({ ...pkg, version: "0.6.3" })).toThrow();
    expect(() => checkPackage({ ...pkg, dist: { integrity: "sha512-fixture" } })).toThrow();
  });

  it("requires the exact immutable published release", () => {
    const release = { tag_name: "cli-v0.6.2", draft: false, prerelease: false, immutable: true };
    expect(() => checkRelease(release)).not.toThrow();
    expect(() => checkRelease({ ...release, tag_name: "cli-v0.6.1" })).toThrow();
    expect(() => checkRelease({ ...release, draft: true })).toThrow();
    expect(() => checkRelease({ ...release, immutable: false })).toThrow();
  });
});

// Payload shape from npm's published @uinaf/design@1.14.3 bundle, adapted for recovery.
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    {
      name: "pkg:npm/%40uinaf/attach-cli@0.6.2",
      digest: {
        sha512:
          "5474f59e4b3a709c5f527edcd6114770bf5951bfa0df62bc4636fc1d783af77d9568bb106825e758c4af5574bbebf794a52177bc5a387fe7bc51c4fe3a9ee47b",
      },
    },
  ],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      externalParameters: {
        workflow: {
          ref: "refs/heads/main",
          repository: "https://github.com/uinaf/attach",
          path: ".github/workflows/release.yml",
        },
      },
      internalParameters: {
        github: {
          event_name: "workflow_dispatch",
        },
      },
      resolvedDependencies: [
        {
          uri: "git+https://github.com/uinaf/attach@refs/heads/main",
          digest: {
            gitCommit: "b0b149290e443c0c11ea69d6e084b545e94ddc5d",
          },
        },
      ],
    },
    runDetails: {
      builder: {
        id: "https://github.com/actions/runner/github-hosted",
      },
      metadata: {
        invocationId: "https://github.com/uinaf/attach/actions/runs/32478126334/attempts/1",
      },
    },
  },
};
const integrity = `sha512-${Buffer.from(statement.subject[0].digest.sha512, "hex").toString("base64")}`;
const buildSha = "b0b149290e443c0c11ea69d6e084b545e94ddc5d";
function bundle(payload: unknown) {
  return {
    attestations: [
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: {
          dsseEnvelope: {
            payloadType: "application/vnd.in-toto+json",
            payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
          },
        },
      },
    ],
  };
}
it("checks the actual npm provenance payload", () => {
  expect(() => checkProvenance(bundle(statement), integrity, buildSha)).not.toThrow();
  expect(() => checkProvenance({ attestations: [] }, integrity, buildSha)).toThrow();
  expect(() => checkProvenance(bundle(statement), integrity, "different-sha")).toThrow(
    "event commit",
  );
});
it.each([
  [
    "subject digest",
    (s: typeof statement) => {
      s.subject[0].digest.sha512 = "0".repeat(128);
    },
  ],
  [
    "subject name",
    (s: typeof statement) => {
      s.subject[0].name = "pkg:npm/other@0.6.2";
    },
  ],
  [
    "repository",
    (s: typeof statement) => {
      s.predicate.buildDefinition.externalParameters.workflow.repository =
        "https://github.com/other/design";
    },
  ],
  [
    "workflow",
    (s: typeof statement) => {
      s.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml";
    },
  ],
  [
    "ref",
    (s: typeof statement) => {
      s.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/cli-v0.6.2";
    },
  ],
  [
    "event",
    (s: typeof statement) => {
      s.predicate.buildDefinition.internalParameters.github.event_name = "push";
    },
  ],
  [
    "runner",
    (s: typeof statement) => {
      s.predicate.runDetails.builder.id = "https://github.com/actions/runner/self-hosted";
    },
  ],
])("rejects a mismatched provenance %s", (_label, mutate) => {
  const changed = structuredClone(statement);
  mutate(changed);
  expect(() => checkProvenance(bundle(changed), integrity, buildSha)).toThrow();
});
