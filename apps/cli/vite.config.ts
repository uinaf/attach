import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      attach: "src/attach.ts",
    },
    banner: "#!/usr/bin/env node",
    // npm bin fields reject `.mjs`; package is `"type": "module"` so `.js` is ESM.
    outExtensions: () => ({ js: ".js" }),
    deps: {
      // Publish a self-contained binary; consumers must not need the workspace.
      alwaysBundle: ["@uinaf/attach-shared"],
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
