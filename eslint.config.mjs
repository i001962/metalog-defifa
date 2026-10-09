import { fixupConfigRules } from '@eslint/compat'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  globalIgnores(['.next*/**', 'node_modules/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**']),
])
