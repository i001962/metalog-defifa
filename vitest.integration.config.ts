import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/integration/**/*.integration.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 120_000,
  },
})
