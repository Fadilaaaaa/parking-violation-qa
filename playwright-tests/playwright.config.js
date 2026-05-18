// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3030',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Run API tests and UI tests separately
  projects: [
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.js',
      use: { baseURL: 'http://localhost:8090' },
    },
    {
      name: 'ui',
      testMatch: '**/ui/**/*.spec.js',
      use: { baseURL: 'http://localhost:3030' },
    },
  ],
});
