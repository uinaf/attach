import { afterEach, describe, expect, it } from "vite-plus/test";
import { ATTACH_GITHUB_CLIENT_ID_DEFAULT, clientId } from "../src/config.ts";

const originalApiBase = process.env.ATTACH_API_BASE;
const originalClientId = process.env.ATTACH_GITHUB_CLIENT_ID;

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("ATTACH_API_BASE", originalApiBase);
  restore("ATTACH_GITHUB_CLIENT_ID", originalClientId);
});

describe("GitHub App client id", () => {
  it("uses the bundled public id for the hosted service", () => {
    delete process.env.ATTACH_API_BASE;
    delete process.env.ATTACH_GITHUB_CLIENT_ID;
    expect(clientId()).toBe(ATTACH_GITHUB_CLIENT_ID_DEFAULT);
  });

  it("accepts an equivalent hosted service URL with a trailing slash", () => {
    process.env.ATTACH_API_BASE = "https://attach.uinaf.dev/";
    delete process.env.ATTACH_GITHUB_CLIENT_ID;
    expect(clientId()).toBe(ATTACH_GITHUB_CLIENT_ID_DEFAULT);
  });

  it("honors an explicit override", () => {
    process.env.ATTACH_API_BASE = "https://custom.example";
    process.env.ATTACH_GITHUB_CLIENT_ID = "custom-client-id";
    expect(clientId()).toBe("custom-client-id");
  });

  it("requires an override for a custom API base", () => {
    process.env.ATTACH_API_BASE = "https://custom.example";
    delete process.env.ATTACH_GITHUB_CLIENT_ID;
    expect(() => clientId()).toThrowError("required for a custom ATTACH_API_BASE");
  });

  it("requires an override for a custom path on the hosted origin", () => {
    process.env.ATTACH_API_BASE = "https://attach.uinaf.dev/custom";
    delete process.env.ATTACH_GITHUB_CLIENT_ID;
    expect(() => clientId()).toThrowError("required for a custom ATTACH_API_BASE");
  });
});
