import { defineConfig, devices } from '@playwright/test'

const host = '127.0.0.1'
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const localChromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: [['html', { open: 'never' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://${host}:${port}`,
    launchOptions: localChromiumExecutable
      ? { executablePath: localChromiumExecutable }
      : undefined,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm --filter @nebenkosten/web preview --host ${host} --port ${port} --strictPort`,
    reuseExistingServer: !process.env.CI,
    stderr: 'pipe',
    stdout: 'pipe',
    url: `http://${host}:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
