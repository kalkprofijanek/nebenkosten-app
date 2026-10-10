import { expect, test } from '@playwright/test'
import { consumptionFixture } from '../../apps/web/src/features/consumption/consumption-fixture'

test('prüft eine KI-Erfassungsliste vor atomarer Übernahme und verhindert Duplikate', async ({
  page,
}) => {
  const data = consumptionFixture()
  data.billingData.costCategories.push({
    id: 'clean',
    billingPeriodId: 'y',
    kind: 'operating',
    label: 'Reinigung',
    allocationKey: 'usable_area',
  })
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.goto('/')
  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'fiktiver-kostenbestand.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page
    .getByRole('button', { name: 'Kostenpositionen', exact: true })
    .click()
  const csv = {
    name: 'fiktive-erfassungsliste.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Kostenart;Belegdatum;Leistung von;Leistung bis;Beschreibung;Belegnummer;Betrag brutto EUR;Umlagefaehig Prozent;Lohnanteil EUR;Lieferant;Begruendung;Rueckfrage\nReinigung;20.01.2025;01.01.2025;31.01.2025;Fiktive Reinigung;TEST-1;95,20;100;;Fiktiver Betrieb;§ 2 Nr. 9;',
    ),
  }
  await page.getByLabel('CSV-Erfassungsliste auswählen').setInputFiles(csv)
  await expect(
    page.getByRole('table', { name: 'Vorschau der Erfassungsliste' }),
  ).toContainText('95,20')
  await expect(
    page
      .getByRole('table', { name: 'Kostenpositionen bearbeiten' })
      .getByRole('row')
      .filter({ hasText: 'TEST-1' }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Geprüfte Kostenpositionen übernehmen' })
    .click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '1 Kostenpositionen übernommen' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('table', { name: 'Kostenpositionen bearbeiten' })
      .getByRole('row')
      .filter({ hasText: 'TEST-1' }),
  ).toHaveCount(1)
  await page.getByLabel('CSV-Erfassungsliste auswählen').setInputFiles(csv)
  await expect(
    page.getByRole('alert').filter({ hasText: 'Duplikat' }),
  ).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Vorschau der Erfassungsliste' }),
  ).toHaveCount(0)
  await page.reload()
  await page
    .getByRole('button', { name: 'Kostenpositionen', exact: true })
    .click()
  await expect(
    page
      .getByRole('table', { name: 'Kostenpositionen bearbeiten' })
      .getByRole('row')
      .filter({ hasText: 'TEST-1' }),
  ).toHaveCount(1)
})
