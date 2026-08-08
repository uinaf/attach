import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      attach: "src/attach.ts",
    },
    banner: "#!/usr/bin/env node",
    deps: {
      // Publish a self-contained binary; consumers must not need the workspace.
      alwaysBundle: ["@uinaf/attach-shared"],
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
