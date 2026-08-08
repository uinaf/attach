import { describe, expect, it } from "vite-plus/test";
import { parseObjectRef } from "@uinaf/attach-shared";

describe("cli helpers", () => {
  it("accepts url and opaque key", () => {
    const key = "abcdefghijklmnopqrstuv";
    expect(parseObjectRef(`https://attach.uinaf.dev/o/${key}`)).toBe(key);
    expect(parseObjectRef(key)).toBe(key);
  });
});
