import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

test.use({ screenshot: 'only-on-failure' })
test.afterEach(async ({ page }, info) => {
  await writeFile(
    info.outputPath('visible-page.txt'),
    await page.locator('body').innerText(),
  )
  if (info.status !== info.expectedStatus)
    await info.attach('visible-page', {
      body: await page.locator('body').innerText(),
      contentType: 'text/plain',
    })
})

// Entire scenario is fictional. This audit records the actual release barrier,
// not a successful heating bill: meter readings do not populate consumption units.
async function save(page: Page) {
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
}
async function click(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
  await save(page)
}
async function route(page: Page, name: string) {
  const navigation = page.getByRole('navigation', {
    name: 'Abrechnungsbereiche',
  })
  if (!(await navigation.isVisible()))
    await page.getByRole('button', { name: 'Bereiche öffnen' }).click()
  await page.getByRole('link', { name, exact: true }).click()
}
async function fill(page: Page, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values))
    await page.getByLabel(label, { exact: true }).fill(value)
}
async function select(
  page: Page,
  label: string,
  option: string | { label: string },
) {
  const labelled = page.getByLabel(label, { exact: true })
  if (await labelled.count()) return labelled.selectOption(option)
  return page
    .locator('label')
    .filter({ hasText: label })
    .locator('select')
    .first()
    .selectOption(option)
}
async function evidence(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    `${name}: document must not overflow`,
  ).toBe(true)
}
async function setup(page: Page) {
  await page.goto('/')
  await click(page, 'Arbeitsbestand anlegen')
  await route(page, 'Firmen')
  await fill(page, {
    Mandantenname: 'Fiktive Heizauditverwaltung',
    Firmenname: 'Fiktive Heizauditeigentümerin',
  })
  await click(page, 'Firma anlegen')
  await route(page, 'Objekte')
  await fill(page, {
    'Interne Objektnummer': 'FIKTIV-HEIZ-20',
    Straße: 'Fiktives Heizauditobjekt',
    'Postleitzahl und Ort': '00000 Musterstadt',
    Gebäudename: 'Fiktiv Ölhaus',
    'Erste Einheit': 'Öl 1',
    'Nutzfläche in m²': '60',
    'Beheizte Fläche in m²': '60',
  })
  await click(page, 'Objekt anlegen')
  await fill(page, { 'Neuer Gebäudename': 'Fiktiv Wärmepumpenhaus' })
  await click(page, 'Gebäude hinzufügen')
  for (const [building, label] of [
    ['Fiktiv Ölhaus', 'Öl 2'],
    ['Fiktiv Wärmepumpenhaus', 'WP 1'],
    ['Fiktiv Wärmepumpenhaus', 'WP 2'],
  ]) {
    await select(page, 'Gebäude der neuen Einheit', { label: building })
    await fill(page, {
      'Neue Einheitenbezeichnung': label!,
      'Neue Nutzfläche in m²': '60',
      'Neue beheizte Fläche in m²': '60',
    })
    await click(page, 'Einheit hinzufügen')
  }
  await expect(
    page.getByRole('table', { name: 'Einheitenübersicht' }).getByRole('row'),
  ).toHaveCount(5)
  await route(page, 'Abrechnungsjahre')
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await click(page, 'Abrechnungsjahr anlegen')
}
async function occupancies(page: Page) {
  await route(page, 'Nutzer')
  for (const [unit, name, from, to] of [
    ['Öl 1', 'Fiktiv Alt', '2026-01-01', '2026-06-30'],
    ['Öl 1', 'Fiktiv Neu', '2026-09-01', '2026-12-31'],
    ['Öl 2', 'Fiktiv Öl Zwei', '2026-01-01', '2026-12-31'],
    ['WP 1', 'Fiktiv WP Eins', '2026-01-01', '2026-12-31'],
    ['WP 2', 'Fiktiv WP Zwei', '2026-01-01', '2026-12-31'],
  ]) {
    await select(page, 'Einheit', { label: unit })
    await fill(page, {
      Anzeigename: name!,
      Einzug: from!,
      Auszug: to!,
      Personenzahl: '1',
      'Vorauszahlung in Euro': '100',
    })
    await click(page, 'Nutzer anlegen')
  }
  await select(page, 'Leerstandseinheit', { label: 'Öl 1' })
  await fill(page, {
    'Leerstand von': '2026-07-01',
    'Leerstand bis': '2026-08-31',
    Leerstandsnotiz: 'Fiktive Renovierung',
  })
  await click(page, 'Leerstand anlegen')
  await expect(
    page.getByRole('heading', { name: 'Wohnungen und Belegungen (4)' }),
  ).toBeVisible()
}
async function heating(page: Page) {
  await route(page, 'Heizkreise')
  for (const [building, source, kind, calorific] of [
    ['Fiktiv Ölhaus', 'Fiktives Heizöl', 'oil', '10'],
    ['Fiktiv Wärmepumpenhaus', 'Fiktiver Wärmepumpenstrom', 'electricity', '1'],
  ]) {
    await select(page, 'Gebäude', { label: building })
    await fill(page, {
      Heizsystem: source!,
      Quellenschlüssel: kind!,
      Energiequelle: source!,
      Energieträger: kind!,
      'Heizwert kWh je Einheit': calorific!,
    })
    await click(page, 'Heizkreis anlegen')
  }
  await expect(
    page.getByRole('heading', { name: 'Heizkreise (2)' }),
  ).toBeVisible()
}
async function delivery(
  page: Page,
  description: string,
  date: string,
  quantity: string,
  amount: string,
  unit: string,
) {
  await fill(page, {
    Lieferdatum: date,
    Liefermenge: quantity,
    'Lieferbetrag in Euro': amount,
    'Beschreibung der Lieferung': description,
    'Belegreferenz der Lieferung': `FIKTIV-${date}`,
  })
  await select(page, 'Liefermengeneinheit', unit)
  await click(page, 'Lieferung hinzufügen')
}
async function fuel(page: Page) {
  await page.getByRole('button', { name: 'Brennstoffe', exact: true }).click()
  await select(page, 'Aktive Energiequelle', { label: 'Fiktives Heizöl' })
  await select(page, 'Mengeneinheit', 'l')
  await fill(page, {
    'Anfangsbestand Menge': '500',
    'Anfangsbestand Wert in Euro': '500',
    'Restbestand Menge': '300',
  })
  await click(page, 'Bestand speichern')
  await delivery(
    page,
    'Fiktive Öllieferung Februar',
    '2026-02-01',
    '1000',
    '1200',
    'l',
  )
  await delivery(
    page,
    'Fiktive Öllieferung Oktober',
    '2026-10-01',
    '800',
    '9000',
    'l',
  )
  await page
    .getByRole('button', { name: 'Fiktive Öllieferung Oktober bearbeiten' })
    .click()
  await fill(page, { 'Lieferbetrag bearbeiten': '900' })
  await click(page, 'Lieferung speichern')
  await expect(
    page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Fiktive Öllieferung Oktober' }),
    }),
  ).toContainText('900.00 €')
  await select(page, 'Aktive Energiequelle', {
    label: 'Fiktiver Wärmepumpenstrom',
  })
  await delivery(
    page,
    'Fiktiver WP Strom Halbjahr eins',
    '2026-06-30',
    '3000',
    '900',
    'kWh',
  )
  await delivery(
    page,
    'Fiktiver WP Strom Halbjahr zwei',
    '2026-12-31',
    '2000',
    '600',
    'kWh',
  )
}
async function meters(page: Page) {
  await page.getByRole('button', { name: 'Zähler', exact: true }).click()
  for (const name of ['FIKTIV-OEL-20', 'FIKTIV-WP-20']) {
    await select(page, 'Zählerart', 'heat')
    await fill(page, {
      Zählernummer: name,
      Versorger: 'Fiktiver Versorger',
      'Gültig von': '2026-01-01',
    })
    await select(page, 'Status der Zählernummer', 'confirmed')
    await click(page, 'Zähler anlegen')
    await select(page, 'Aktiver Zähler', { label: name })
    for (const [date, value] of [
      ['2026-01-01', '1000'],
      ['2026-12-31', '90000'],
    ]) {
      await fill(page, { Ablesedatum: date!, Zählerstand: value! })
      await select(page, 'Ableseeinheit', 'kWh')
      await click(page, 'Ablesung erfassen')
    }
    await page.getByRole('button', { name: '90000 kWh bearbeiten' }).click()
    await fill(page, { 'Zählerstand bearbeiten': '9000' })
    await click(page, 'Ablesung speichern')
    await expect(
      page.getByRole('button', { name: '9000 kWh bearbeiten' }),
    ).toBeVisible()
    await page.getByLabel('Bankbuchung vorhanden').check()
    await page.getByLabel('Jahresrechnung vorhanden').check()
    await click(page, 'Jahresstatus speichern')
  }
}
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  test(`fictional oil and heat-pump audit reaches actual release barrier (${name})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await setup(page)
    await occupancies(page)
    await evidence(page, info, '01-occupancy-change-vacancy')
    await heating(page)
    await evidence(page, info, '02-two-heating-circuits')
    await fuel(page)
    await evidence(page, info, '03-deliveries')
    await meters(page)
    await evidence(page, info, '04-corrected-readings')
    await page.reload()
    await page.getByRole('button', { name: 'Zähler', exact: true }).click()
    await expect(
      page.getByRole('button', { name: '9000 kWh bearbeiten' }),
    ).toBeVisible()
    await route(page, 'Berechnung')
    await click(page, 'Abrechnung berechnen')
    await expect(page.getByText('Erfasste Kosten')).toBeVisible()
    await evidence(page, info, '05-calculation')
    await route(page, 'Freigabe')
    await click(page, 'Prüfung starten')
    await expect(
      page.getByRole('button', { name: 'Für PDF freigeben' }),
    ).toBeDisabled()
    await evidence(page, info, '06-release-blockers')
    await route(page, 'PDF und Export')
    await expect(
      page.getByText(/PDF-Ausgabe und Export sind erst verfügbar/),
    ).toBeVisible()
    await evidence(page, info, '07-pdf-unavailable')
    await route(page, 'Sicherung')
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'JSON-Sicherung herunterladen' })
      .click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).not.toBeNull()
    const exported = JSON.parse(await readFile(path!, 'utf8'))
    expect(exported.billingData.heatingCircuits).toHaveLength(2)
    expect(exported.billingData.fuelDeliveries).toHaveLength(4)
    expect(
      exported.billingData.fuelDeliveries.find(
        (item: { description: string }) =>
          item.description === 'Fiktive Öllieferung Oktober',
      ).amountCents,
    ).toBe(90000)
    expect(exported.billingData.meterReadings).toHaveLength(4)
    expect(
      exported.billingData.meterReadings.filter(
        (item: { value: { value: number } }) => item.value.value === 9000,
      ),
    ).toHaveLength(2)
    expect(exported.billingData.documents).toHaveLength(0)
    await download.saveAs(info.outputPath('fictional-heating-audit.json'))
    expect(errors).toEqual([])
  })
}
