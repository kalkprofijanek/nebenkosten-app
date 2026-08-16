import { expect, test } from '@playwright/test'

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

  await page.setViewportSize({ width: 390, height: 844 })

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth)
  await expect(page.getByLabel('Firma im Arbeitskontext')).toBeVisible()
  await expect(page.getByLabel('Objekt im Arbeitskontext')).toBeVisible()
  await expect(page.getByLabel('Zeitraum im Arbeitskontext')).toBeVisible()
})
