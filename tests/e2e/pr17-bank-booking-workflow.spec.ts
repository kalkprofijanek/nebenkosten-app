import { expect, test } from '@playwright/test'

test('imports, classifies and links a bank booking without stale form state', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Musterverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('BANK-TEST-01')
  await page.getByLabel('Straße').fill('Fiktiver Weg 1')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Musterstadt')
  await page.getByLabel('Gebäudename').fill('Haus A')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('60')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()

  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page.getByLabel('Neue Kostenart').fill('Wasserversorgung')
  await page.getByRole('button', { name: 'Kostenart anlegen' }).click()
  await page.getByLabel('Neue Kostenart').fill('Abwasserentsorgung')
  await page.getByRole('button', { name: 'Kostenart anlegen' }).click()

  await page.getByRole('button', { name: 'Bankbuchungen' }).click()
  const csvFile = {
    name: 'fiktive-bankbuchungen.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Datum;Betrag;Auftraggeber;Verwendungszweck\n15.03.2026;-333,44;Fiktive Wasserwerke;Wasser 2026',
      'utf8',
    ),
  }
  await page.getByLabel('CSV-Datei mit Bankbuchungen').setInputFiles(csvFile)
  await expect(page.getByText(/1 Buchungen importiert/)).toBeVisible()
  await page.getByLabel('CSV-Datei mit Bankbuchungen').setInputFiles(csvFile)
  await expect(
    page.getByText('0 Buchungen importiert, 1 Duplikate übersprungen.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wasser 2026' })).toHaveCount(
    1,
  )

  await page.getByRole('button', { name: 'Wasser 2026 bearbeiten' }).click()
  await page
    .getByLabel('Buchungskategorie bearbeiten')
    .selectOption('NK_UMLEGBAR')
  await page.getByLabel('Split 1 Betrag in Euro').fill('-200,00')
  await page
    .getByLabel('Split 1 Kostenart')
    .selectOption({ label: 'Wasserversorgung' })
  await page.getByLabel('Split 2 Betrag in Euro').fill('-133,44')
  await page
    .getByLabel('Split 2 Kostenart')
    .selectOption({ label: 'Abwasserentsorgung' })
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await page.getByRole('button', { name: 'Als geprüft markieren' }).click()
  await expect(
    page.getByRole('paragraph').filter({ hasText: /^Geprüft$/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Wasser 2026 bearbeiten' }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Buchung wieder öffnen' }).click()
  await page.getByRole('button', { name: 'Wasser 2026 bearbeiten' }).click()
  await expect(page.getByLabel('Split 1 Betrag in Euro')).toHaveValue('-200,00')
  await expect(page.getByLabel('Split 2 Betrag in Euro')).toHaveValue('-133,44')
  await page.getByLabel('Prüfnotiz').fill('Aufteilung fachlich geprüft')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await page.getByRole('button', { name: 'Als geprüft markieren' }).click()

  await page.getByRole('button', { name: 'Kostenpositionen' }).click()
  await page.getByLabel('Beschreibung').fill('Wasserabrechnung 2026')
  await page.getByLabel('Betrag in Euro').fill('333,44')
  await page.getByLabel('Zahlungsnachweis').selectOption('booking')
  const bookingSelect = page.getByLabel('Zugehörige Bankbuchung')
  const bookingValue = await bookingSelect
    .locator('option')
    .filter({ hasText: 'Fiktive Wasserwerke' })
    .getAttribute('value')
  expect(bookingValue).not.toBeNull()
  await bookingSelect.selectOption(bookingValue!)
  await page.getByRole('button', { name: 'Kostenposition anlegen' }).click()

  await expect(page.getByText('Wasserabrechnung 2026')).toBeVisible()
  await expect(page.getByLabel('Zahlungsnachweis')).toHaveValue('none')
  await expect(page.getByLabel('Zugehörige Bankbuchung')).toHaveCount(0)
})
