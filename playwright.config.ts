import { defineConfig } from "@playwright/test";

// When PLAYWRIGHT_BASE_URL is set (maintenance runs against production) no
// local preview server is started; otherwise tests run against a preview of
// the local build.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: { baseURL },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4321",
        port: 4321,
        reuseExistingServer: !process.env.CI,
      },
});
