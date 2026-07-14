import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      exclude: ['apps/web/src/**/*.test.tsx'],
      include: ['apps/web/src/**/*.{ts,tsx}'],
      provider: 'v8',
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
    environment: 'jsdom',
    include: ['apps/web/src/**/*.test.tsx'],
    setupFiles: ['./tests/setup-vitest.ts'],
  },
})
