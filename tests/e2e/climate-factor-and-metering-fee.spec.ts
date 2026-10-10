import { expect, test, type Page } from '@playwright/test'
import { consumptionFixture } from '../../apps/web/src/features/consumption/consumption-fixture'

async function importFixture(page: Page) {
  const data = consumptionFixture()
  data.masterData.properties[0]!.address = {
    postalCodeAndCity: '01234 Fiktivstadt',
  }
  data.billingData.costCategories.push({
    id: 'fee',
    billingPeriodId: 'y',
    kind: 'heating',
    label: 'Fiktive Dienstleistung',
    totalAmountCents: 12345,
    allocationKey: 'heated_area',
    scope: { kind: 'building', buildingId: 'b1' },
  })
  await page.goto('/')
  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'fiktive-klimafaktoren.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
}

test('übernimmt den DWD-Faktor der Objekt-PLZ und speichert erst nach Prüfung', async ({
  page,
}) => {
  await importFixture(page)
  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }).click()
  await page.getByLabel('Klimafaktor erfassen').check()
  await expect(page.getByLabel('Postleitzahl Klimafaktor')).toHaveValue('01234')
  await page.getByLabel('DWD-Klimafaktor-CSV importieren').setInputFiles({
    name: 'fiktive-dwd-liste.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'DatAnf;DatEnd;PLZ;KF_k\n20250101;20251231;1234;1,14\n20250101;20251231;54321;0,91',
    ),
  })
  await expect(page.getByLabel('DWD-Klimafaktor')).toHaveValue('1,14')
  await expect(page.getByLabel('Quelle Klimafaktor')).toHaveValue(
    'Deutscher Wetterdienst',
  )
  await page
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }).click()
  await expect(page.getByLabel('Klimafaktor erfassen')).toBeChecked()
  await expect(page.getByLabel('DWD-Klimafaktor')).toHaveValue('1,14')
})

test('speichert ein ausdrückliches Messdienstentgelt und setzt es auf automatisch zurück', async ({
  page,
}) => {
  await importFixture(page)
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktive Dienstleistung bearbeiten' })
    .click()
  await page.getByLabel('Messdienstentgelt (§ 6a HeizKV)').selectOption('true')
  await page
    .getByRole('button', { name: 'Kostenart speichern', exact: true })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktive Dienstleistung bearbeiten' })
    .click()
  await expect(page.getByLabel('Messdienstentgelt (§ 6a HeizKV)')).toHaveValue(
    'true',
  )
  await page.getByLabel('Messdienstentgelt (§ 6a HeizKV)').selectOption('')
  await page
    .getByRole('button', { name: 'Kostenart speichern', exact: true })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page
    .getByRole('button', { name: 'Fiktive Dienstleistung bearbeiten' })
    .click()
  await expect(page.getByLabel('Messdienstentgelt (§ 6a HeizKV)')).toHaveValue(
    '',
  )
})
