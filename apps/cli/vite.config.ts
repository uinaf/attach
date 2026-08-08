import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      attach: "src/attach.ts",
    },
    banner: "#!/usr/bin/env node",
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
