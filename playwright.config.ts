import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3230', channel: 'chrome', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: 'node tests/qa/browser-server.mjs',
    url: 'http://127.0.0.1:3230/sign-in',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3230' },
  },
});
