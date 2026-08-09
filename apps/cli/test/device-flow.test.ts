import { describe, expect, it } from "vite-plus/test";
import { deviceAuthorizationPrompt } from "../src/device-flow.ts";

describe("device authorization prompt", () => {
  it("tells a headless caller to relay the URL and code to the intended user", () => {
    expect(deviceAuthorizationPrompt("https://github.com/login/device", "ABCD-EFGH")).toEqual([
      "Authorize Attach at: https://github.com/login/device",
      "Device code: ABCD-EFGH",
      "Relay this short-lived code to the intended user completing authorization.",
      "Do not post it to logs, issues, or other public channels.",
    ]);
  });
});
