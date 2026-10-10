import { defineConfig, devices } from '@playwright/test'

// Opt-in: requires a production build, Anvil and read-only upstream RPC access.
export default defineConfig({
  testDir: './test/browser',
  testMatch: 'lifecycle.fork.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 60_000 },
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure', actionTimeout: 60_000, navigationTimeout: 60_000 },
})
