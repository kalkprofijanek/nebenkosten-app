import { expect, test } from '@playwright/test'

test('walks through the visible billing workflow without console errors', async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Abrechnung im Blick' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Firmen verwalten' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Kosten erfassen' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Freigabe', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Abrechnung freigeben' }),
  ).toBeVisible()

  expect(consoleErrors).toEqual([])
})
