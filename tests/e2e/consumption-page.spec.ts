import { expect, test } from '@playwright/test'
import { consumptionFixture } from '../../apps/web/src/features/consumption/consumption-fixture'

test('Verbrauchsseite schätzt fehlende Verbrauchseinheiten', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.goto('/')
  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'fiktiver-verbrauch.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(consumptionFixture())),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.getByRole('link', { name: 'Verbrauch', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Zählerstände und Verbrauchseinheiten' }),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('verbrauch-start.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Verbrauch schätzen Wohnung 3 Fiktiv 3' })
    .click()
  await expect(
    page.getByLabel('Verbrauchseinheiten Wohnung 3 Fiktiv 3'),
  ).toHaveValue('500')
  await page.screenshot({
    path: info.outputPath('verbrauch-geschaetzt.png'),
    fullPage: true,
  })
  await page
    .getByRole('button', { name: 'Verbrauch speichern Wohnung 3 Fiktiv 3' })
    .click()
  await expect(
    page.getByText('Verbrauch für Wohnung 3 (Fiktiv 3) gespeichert.'),
  ).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
})
