import { expect, test } from '@playwright/test'
import {
  createMeteredFixture,
  meteringId,
} from '../../apps/web/src/features/metering/metered-fixture'

test('speichert optionale Vergleichswerte am Heizkreis und entfernt sie ausdrücklich', async ({
  page,
}) => {
  const data = createMeteredFixture()
  data.billingData.energySources = [
    {
      id: meteringId(17),
      heatingCircuitId: meteringId(11),
      key: 'haupt',
      name: 'Fiktiver Heizkreis',
      sourceType: 'Fiktives Gas',
    },
  ]
  await page.goto('/')
  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'fiktive-vergleichswerte.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
  await page.getByRole('link', { name: 'Heizkreise', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' })
    .click()
  await page
    .getByLabel('Vergleichswerte für diesen Heizkreis hinterlegen')
    .check()
  await page
    .getByLabel('Quelle Vergleichswerte')
    .fill('Fiktive Vergleichsquelle')
  await page
    .getByLabel('Fundstelle Vergleichswerte')
    .fill('https://example.invalid/vergleich')
  await page.getByLabel('Bezugsjahr Vergleichswerte').fill('2025')
  await page
    .getByLabel('Nutzerkategorie Vergleichswerte')
    .fill('Fiktive Gebäudekategorie')
  await page.getByLabel('Niedrig bis (kWh/m²·a)').fill('70')
  await page.getByLabel('Mittel bis (kWh/m²·a)').fill('130')
  await page.getByLabel('Erhöht bis (kWh/m²·a)').fill('200')
  await page.getByLabel('Heizsystem bearbeiten').fill('Fiktives Heizsystem')
  await page
    .getByRole('button', { name: 'Heizkreis speichern', exact: true })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Heizkreise', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' })
    .click()
  await expect(page.getByLabel('Nutzerkategorie Vergleichswerte')).toHaveValue(
    'Fiktive Gebäudekategorie',
  )
  await expect(page.getByLabel('Niedrig bis (kWh/m²·a)')).toHaveValue('70')
  await page
    .getByRole('button', { name: 'Vergleichswerte entfernen', exact: true })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Heizkreise', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktiver Heizkreis bearbeiten' })
    .click()
  await expect(
    page.getByLabel('Vergleichswerte für diesen Heizkreis hinterlegen'),
  ).not.toBeChecked()
})
