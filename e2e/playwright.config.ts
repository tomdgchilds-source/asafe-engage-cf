import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for the A-SAFE Engage smoke test.
 *
 * `baseURL` is read from E2E_BASE_URL (set in CI to the Cloudflare Workers
 * production URL) and falls back to the deployed production URL for local runs.
 *
 * One chromium project. A shared `auth.json` storageState is written by the
 * sign-in step of the smoke test and reused by the rest of the flow so we
 * never log in twice in the same CI run.
 */

const baseURL =
  process.env.E2E_BASE_URL || 'https://asafe-engage.tom-d-g-childs.workers.dev';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // storageState written/consumed during the smoke flow itself.
        storageState: undefined,
      },
    },
  ],
});
