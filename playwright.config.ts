import { defineConfig } from '@playwright/test';

// Runs against the static export served from out/ (stand-in for Cloudflare static assets) and the local Supabase stack.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-out.mjs', url: 'http://localhost:3000', reuseExistingServer: true },
});
