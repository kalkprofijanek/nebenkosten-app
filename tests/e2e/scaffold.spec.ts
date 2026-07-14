import { expect, test } from '@playwright/test'

test('renders the neutral workspace without console errors', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Nebenkosten-App' }),
  ).toBeVisible()
  await expect(page.getByText('Technisches Grundgerüst')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
