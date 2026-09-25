import { defineConfig, devices } from '@playwright/test';

// The site against the Firebase emulators (npm run test:e2e starts them) with
// the files Worker stood in for (e2e/fixtures.js). One test at a time: they
// share one emulator.
const proxy = process.env.HTTPS_PROXY;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Where the browser comes pre-installed, and web fonts only reach out
      // through a proxy, use those.
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      ...(proxy ? { args: [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1'] } : {}),
    },
  },
  webServer: {
    command: 'npx vite --port 5173 --host 127.0.0.1 --strictPort',
    env: { VITE_EMULATORS: 'true' },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
