import { expect, test } from '@playwright/test'

test('offers keyboard navigation and understandable form errors', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Zum Inhalt springen' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()
  await page.getByRole('link', { name: 'Firmen', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Firmen verwalten' }),
  ).toBeVisible()

  await page.getByLabel('Mandantenname').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Firmenname')).toBeFocused()
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(page.getByRole('alert')).toContainText(
    /Mandantenname|Firmenname/u,
  )
})
