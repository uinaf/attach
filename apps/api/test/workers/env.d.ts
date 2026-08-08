declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
  }
}
