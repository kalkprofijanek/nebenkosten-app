import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function createWorkspace(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
}

async function createCompany(page: Page) {
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktive Prüfverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
}

async function createPropertyAndYear(page: Page) {
  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('UI-ROBUST-01')
  await page.getByLabel('Straße').fill('Prüfobjekt Alpha')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Musterstadt')
  await page.getByLabel('Gebäudename').fill('Haus Prüfung')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('67,5')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
}

test('keeps every route reachable and recovers unknown direct links', async ({
  page,
}) => {
  await createWorkspace(page)

  const routes = [
    ['Firmen', 'Firmen verwalten'],
    ['Objekte', 'Objekte verwalten'],
    ['Abrechnungsjahre', 'Abrechnungsjahre planen'],
    ['Nutzer', 'Nutzer und Wechsel'],
    ['Kosten', 'Kosten erfassen'],
    ['Heizkreise', 'Heizkreise vorbereiten'],
    ['Berechnung', 'Abrechnung berechnen'],
    ['Freigabe', 'Abrechnung freigeben'],
    ['PDF und Export', 'PDF und Export'],
    ['Sicherung', 'Sicherung und Wiederherstellung'],
  ] as const

  for (const [link, heading] of routes) {
    await page.getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }

  await page.evaluate(() => {
    window.location.hash = '#/unbekannter-bereich'
  })
  await expect(
    page.getByRole('heading', { name: 'Abrechnung im Blick' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/#\/unbekannter-bereich$/)
})

test('preserves edits and explains why linked master data cannot be deleted', async ({
  page,
}) => {
  await createWorkspace(page)
  await createCompany(page)
  await createPropertyAndYear(page)

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByRole('button', { name: 'Firma bearbeiten' }).click()
  await page.getByLabel('E-Mail Kontakt bearbeiten').fill('TEST-KONTAKT-EMAIL')
  await page.getByLabel('IBAN bearbeiten').fill('TEST-IBAN')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Firma bearbeiten' }).click()
  await expect(page.getByLabel('E-Mail Kontakt bearbeiten')).toHaveValue(
    'TEST-KONTAKT-EMAIL',
  )
  await expect(page.getByLabel('IBAN bearbeiten')).toHaveValue('TEST-IBAN')

  await page.getByRole('button', { name: 'Firma löschen' }).click()
  await page.getByRole('button', { name: 'Löschen bestätigen' }).click()
  await expect(page.getByRole('alert')).toContainText(/Objekt|verwendet/u)
  await expect(
    page.getByRole('heading', { name: 'Fiktive Eigentümerin' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByRole('button', { name: 'Objekt löschen' }).click()
  await page.getByRole('button', { name: 'Löschen bestätigen' }).click()
  await expect(page.getByRole('alert')).toContainText(
    /Abrechnungsjahr|verwendet/u,
  )
  await expect(page.getByText('UI-ROBUST-01').last()).toBeVisible()
})

test('rejects invalid corrections without losing valid form values', async ({
  page,
}) => {
  await createWorkspace(page)

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Bleibt bei Fehler erhalten')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(page.getByRole('alert')).toContainText(/Firmenname/u)
  await expect(page.getByLabel('Mandantenname')).toHaveValue(
    'Bleibt bei Fehler erhalten',
  )

  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Gebäudename').fill('Haus Prüfung')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('-5')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()
  await expect(page.getByRole('alert')).toContainText(/Nutzfläche|positiv/u)
  await expect(page.getByLabel('Gebäudename')).toHaveValue('Haus Prüfung')

  await page.getByLabel('Nutzfläche in m²').fill('55,5')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()
  await expect(
    page.getByRole('heading', { name: 'Objekt ohne Bezeichnung' }),
  ).toBeVisible()
})

test('handles malformed CSV, search and review filters without stale results', async ({
  page,
}) => {
  await createWorkspace(page)
  await createCompany(page)
  await createPropertyAndYear(page)
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page.getByRole('button', { name: 'Bankbuchungen' }).click()

  await page.getByLabel('CSV-Datei mit Bankbuchungen').setInputFiles({
    name: 'ungueltig.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Spalte A;Spalte B\nfoo;bar', 'utf8'),
  })
  await expect(page.getByRole('alert')).toContainText(/Datum|Betrag|CSV/u)

  await page.getByLabel('CSV-Datei mit Bankbuchungen').setInputFiles({
    name: 'filter.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Datum;Betrag;Auftraggeber;Verwendungszweck',
        '01.02.2026;-10,00;Fiktive Alpha GmbH;Winterdienst',
        '02.02.2026;-20,00;Fiktive Beta GmbH;Gartenpflege',
      ].join('\n'),
      'utf8',
    ),
  })
  await expect(page.getByText(/2 Buchungen importiert/)).toBeVisible()

  const bookingTable = page.getByRole('table', {
    name: 'Bankbuchungen bearbeiten',
  })
  const bookingRow = (label: string) =>
    bookingTable.getByRole('row').filter({ hasText: label })

  await page.getByLabel('Bankbuchungen durchsuchen').fill('winter')
  await expect(bookingRow('Winterdienst')).toBeVisible()
  await expect(bookingRow('Gartenpflege')).toHaveCount(0)
  await page.getByLabel('Bankbuchungen durchsuchen').fill('')

  await page.getByRole('button', { name: 'Winterdienst bearbeiten' }).click()
  await page
    .getByLabel('Buchungskategorie bearbeiten')
    .selectOption('NK_NICHT_UMLEGBAR')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await bookingRow('Winterdienst')
    .getByRole('button', { name: 'Als geprüft markieren' })
    .click()

  await page.getByLabel('Prüfstatus').selectOption('reviewed')
  await expect(bookingRow('Winterdienst')).toBeVisible()
  await expect(bookingRow('Gartenpflege')).toHaveCount(0)
  await page.getByLabel('Prüfstatus').selectOption('open')
  await expect(bookingRow('Gartenpflege')).toBeVisible()
  await expect(bookingRow('Winterdienst')).toHaveCount(0)

  await page.getByRole('button', { name: 'Datenübersicht' }).click()
  await expect(
    page.getByRole('heading', { name: 'Bankbuchungen (2)' }),
  ).toBeVisible()
  const overviewBookingTable = page.getByRole('table', {
    name: 'Bankbuchungen des aktiven Jahres und noch offene Buchungen',
  })
  await expect(overviewBookingTable).toContainText('Fiktive Alpha GmbH')
  await expect(overviewBookingTable).toContainText('Fiktive Beta GmbH')
})

test('paginates a long booking list and keeps all totals understandable', async ({
  page,
}) => {
  await createWorkspace(page)
  await createCompany(page)
  await createPropertyAndYear(page)
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page.getByRole('button', { name: 'Bankbuchungen' }).click()

  const rows = Array.from({ length: 51 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0')
    const month = String(Math.floor(index / 28) + 1).padStart(2, '0')
    return `${day}.${month}.2026;-${index + 1},00;Fiktive Firma ${String(index + 1).padStart(2, '0')};Prüfbuchung ${String(index + 1).padStart(2, '0')}`
  })
  await page.getByLabel('CSV-Datei mit Bankbuchungen').setInputFiles({
    name: 'viele-buchungen.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      ['Datum;Betrag;Auftraggeber;Verwendungszweck', ...rows].join('\n'),
      'utf8',
    ),
  })
  await expect(page.getByText(/51 Buchungen importiert/)).toBeVisible()

  await page.getByRole('button', { name: 'Datenübersicht' }).click()
  await expect(
    page.getByRole('heading', { name: 'Bankbuchungen (51)' }),
  ).toBeVisible()
  await expect(page.getByText('Prüfbuchung 01')).toBeVisible()
  await expect(page.getByText('Prüfbuchung 51')).toHaveCount(0)
  const reviewDirectory = process.env['PR17_UI_REVIEW_DIR']
  if (reviewDirectory) {
    await mkdir(reviewDirectory, { recursive: true })
    await page.screenshot({
      path: join(reviewDirectory, 'desktop-kostenuebersicht.png'),
      fullPage: true,
    })
  }
  const pager = page.getByRole('navigation', { name: 'Bankbuchungen Seiten' })
  await pager.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.getByText('Prüfbuchung 51')).toBeVisible()
  await expect(page.getByText('Prüfbuchung 01')).toHaveCount(0)
})

test('cancels a valid import and rejects damaged JSON without replacing data', async ({
  page,
}) => {
  await createWorkspace(page)
  await createCompany(page)
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByRole('link', { name: 'Sicherung', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'JSON-Sicherung herunterladen' })
    .click()
  const download = await downloadPromise
  const backupPath = await download.path()
  expect(backupPath).not.toBeNull()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Zweiter Testmandant')
  await page.getByLabel('Firmenname').fill('Bleibt nach Abbruch bestehen')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByLabel('Daten importieren').setInputFiles(backupPath!)
  await expect(
    page.getByRole('dialog', { name: 'Import prüfen' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Bleibt nach Abbruch bestehen' }),
  ).toBeVisible()

  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'beschaedigt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":4,"kaputt":', 'utf8'),
  })
  await expect(page.getByRole('alert')).toContainText('invalid_json')
  await expect(
    page.getByRole('heading', { name: 'Bleibt nach Abbruch bestehen' }),
  ).toBeVisible()
})

test('does not show a false error or duplicate a company after a double click', async ({
  page,
}) => {
  await createWorkspace(page)
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktiver Doppelklickmandant')
  await page.getByLabel('Firmenname').fill('Einmalige Testfirma')

  await page
    .getByRole('button', { name: 'Firma anlegen' })
    .click({ clickCount: 2, delay: 20 })

  await expect(
    page.getByLabel('Aktive Firma').locator('option', {
      hasText: 'Einmalige Testfirma',
    }),
  ).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
