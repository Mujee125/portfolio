import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 3100;
const MOCK_PORT = 4010;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

/**
 * E2E runs against a real production build (`next start`), with GitHub replaced by a
 * local mock so that rate limits, outages and new repositories are reproducible.
 * `GITHUB_CACHE_TTL_SECONDS=0` makes every request re-read the mock, which is what
 * lets the suite prove "a new repository appears without a redeploy".
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `MOCK_PORT=${MOCK_PORT} node tests/mocks/github-server.mjs`,
      port: MOCK_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      command: `npm run build && npx next start --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        GITHUB_USERNAME: 'octocat',
        GITHUB_API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        ALLOW_NON_DEFAULT_GITHUB_API: 'true',
        GITHUB_CACHE_TTL_SECONDS: '0',
        GITHUB_MAX_PAGES: '5',
        GITHUB_MAX_RETRIES: '0',
        // Failure-path assertions must be deterministic: disable the stale fallback so an
        // upstream failure is always visible rather than masked by a cached snapshot.
        // (The stale-while-error behaviour itself is covered by integration tests.)
        GITHUB_STALE_MAX_SECONDS: '0',
        GITHUB_REQUEST_TIMEOUT_MS: '2000',
        NEXT_PUBLIC_SITE_URL: APP_URL,
        SITE_NAME: 'Test Portfolio',
      },
    },
  ],
});
