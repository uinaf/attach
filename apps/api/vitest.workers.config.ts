import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, "migrations"));

  return {
    test: {
      include: ["test/workers/**/*.test.ts"],
      setupFiles: ["./test/workers/apply-migrations.ts"],
      poolOptions: {
        workers: {
          // SQLite-backed DOs can leave .sqlite-shm that breaks isolated storage pop.
          isolatedStorage: false,
          wrangler: { configPath: "./wrangler.test.toml" },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
