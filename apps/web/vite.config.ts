import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
