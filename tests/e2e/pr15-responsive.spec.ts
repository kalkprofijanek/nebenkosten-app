import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth)
}

test('keeps the complete workspace context inside a mobile viewport', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Musterverwaltung')
  await page.getByLabel('Firmenname').fill('Test Eigentum Zwei')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('UI-TEST-02')
  await page.getByLabel('Straße').fill('Fiktives Beispielobjekt')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Musterstadt')
  await page.getByLabel('Gebäudename').fill('Haus Süd')
  await page.getByLabel('Erste Einheit').fill('Wohnung A')
  await page.getByLabel('Nutzfläche in m²').fill('75')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })

  await expectNoHorizontalOverflow(page)
  await expect(page.getByLabel('Firma im Arbeitskontext')).toBeVisible()
  await expect(page.getByLabel('Objekt im Arbeitskontext')).toBeVisible()
  await expect(page.getByLabel('Zeitraum im Arbeitskontext')).toBeVisible()

  for (const route of ['Kosten', 'Heizkreise', 'PDF und Export', 'Sicherung']) {
    await page.getByRole('button', { name: 'Bereiche öffnen' }).click()
    await page.getByRole('link', { name: route, exact: true }).click()
    await expectNoHorizontalOverflow(page)
  }

  const reviewDirectory = process.env['PR17_UI_REVIEW_DIR']
  if (reviewDirectory) {
    await mkdir(reviewDirectory, { recursive: true })
    await page.screenshot({
      path: join(reviewDirectory, 'mobile-sicherung.png'),
      fullPage: true,
    })
  }
})

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
