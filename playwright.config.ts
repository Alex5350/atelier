import { defineConfig } from "@playwright/test";

/**
 * End-to-end over the real app with mock providers: the suite assumes the
 * stack is up (db migrated and seeded, bun run start on 3000). The CI job
 * does exactly that; locally run scripts/e2e.sh.
 */
export default defineConfig({
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Cookie-less: the spec opts itself anonymous to test the gate and a
      // real UI sign-in (rate-limited by auth, so exactly once per run).
      name: "gate",
      testMatch: /gate\.spec\.ts/,
      use: {
        baseURL: process.env.ATELIER_BASE_URL ?? "http://localhost:3000",
        screenshot: "only-on-failure",
      },
    },
    {
      name: "app",
      testMatch: /app\.spec\.ts/,
      use: {
        baseURL: process.env.ATELIER_BASE_URL ?? "http://localhost:3000",
        screenshot: "only-on-failure",
        storageState: "e2e/.auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],
});
