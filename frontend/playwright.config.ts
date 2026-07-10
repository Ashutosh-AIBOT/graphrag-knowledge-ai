import { defineConfig, devices } from '@playwright/test';

/**
 * GraphRAG E2E configuration.
 * Frontend under test: http://127.0.0.1:3000
 * Backend (referenced by the app + fixtures): http://127.0.0.1:8000/api
 */
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api';

export default defineConfig({
  testDir: './e2e',
  // Each test owns its data and waits on conditions, not wall-clock time.
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    // Soft assertions are used to surface known gaps without hard-blocking the
    // merge-blocking suite. Flip to `false` once those gaps are fixed.
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retries are instrumentation (to MEASURE flakiness), not treatment.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 10_000,
    trace: 'on-first-retry', // zero overhead on green runs, full forensics on red
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

// Expose to fixtures/tests if needed.
export { API_BASE_URL };
