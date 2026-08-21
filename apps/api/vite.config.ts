import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "worker:build": {
        command: "wrangler deploy --dry-run --outdir=dist",
        dependsOn: ["@uinaf/attach-web#build"],
        input: [{ auto: true }, "!dist/**", "!.wrangler/**"],
        output: ["dist/**"],
      },
      "worker:test": {
        command: "vitest run --config vitest.workers.config.ts",
        input: [{ auto: true }, "!.wrangler/**", "!node_modules/.vite/**"],
        output: [],
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/workers/**"],
  },
});
