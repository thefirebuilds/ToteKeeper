import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.browser.ts', timeout: 30000,
  use: { channel: 'chromium', baseURL: 'http://127.0.0.1:5187', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort', url: 'http://127.0.0.1:5187', reuseExistingServer: false },
})
