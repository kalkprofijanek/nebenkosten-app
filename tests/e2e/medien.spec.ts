/**
 * Screenshots für README und Benutzerhandbuch aus dem fiktiven Beispielobjekt
 * (`docs/beispiel/beispielobjekt.json`). Im normalen E2E-Lauf ein Rundgang
 * durch die wichtigsten Arbeitsbereiche; mit `MEDIEN_AKTUALISIEREN=1` werden
 * die Bilder nach `docs/medien/` geschrieben (siehe
 * `scripts/erzeuge-medien.mjs`, ADR-0012).
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

const TARGET = process.env.MEDIEN_AKTUALISIEREN === '1'

// Deutsche Datumsfelder brauchen die Browsersprache, nicht nur die Locale.
test.use({
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  launchOptions: {
    args: ['--lang=de-DE'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
})

async function shot(
  page: Page,
  name: string,
  info: { outputPath(name: string): string },
) {
  await page.mouse.move(0, 0)
  await page.screenshot({
    path: TARGET
      ? resolve(process.cwd(), 'docs/medien', name)
      : info.outputPath(name),
    animations: 'disabled',
  })
}

/** Ausschnitt ab einem Bereich (ohne Seitenleiste), höchstens 900 px hoch. */
async function shotFrom(
  page: Page,
  target: Locator,
  name: string,
  info: { outputPath(name: string): string },
) {
  await page.mouse.move(0, 0)
  const box = await target.boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  if (!box) throw new Error(`Bereich für ${name} nicht sichtbar`)
  await page.screenshot({
    path: TARGET
      ? resolve(process.cwd(), 'docs/medien', name)
      : info.outputPath(name),
    animations: 'disabled',
    fullPage: true,
    clip: {
      x: box.x - 24,
      y: box.y + scrollY - 24,
      width: box.width + 48,
      height: Math.min(box.height + 48, 900),
    },
  })
}

function area(page: Page, name: string) {
  return page
    .getByRole('navigation')
    .getByRole('link', { name: new RegExp(`${name}$`, 'u') })
}

test('Rundgang mit dem Beispielobjekt für die Dokumentation', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')

  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'beispielobjekt.json',
    mimeType: 'application/json',
    buffer: await readFile(
      resolve(process.cwd(), 'docs/beispiel/beispielobjekt.json'),
    ),
  })
  await expect(
    page.getByRole('heading', { name: 'Import prüfen' }),
  ).toBeVisible()
  await shot(page, '02-import-pruefen.png', info)
  await page.getByRole('button', { name: /Import übernehmen/u }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await expect(page.getByText('Mit KI arbeiten')).toBeVisible()
  await shot(page, '01-uebersicht.png', info)

  await page.getByRole('link', { name: 'Jahresabrechnung starten' }).click()
  await page.getByRole('button', { name: 'Geprüft – weiter' }).click()
  const occupancies = page.getByRole('region', {
    name: /Wohnungen und Belegungen/u,
  })
  await expect(occupancies).toBeVisible()
  await shotFrom(page, occupancies, '03-jahresabrechnung-belegung.png', info)

  await area(page, 'Verbrauch').click()
  const consumption = page.getByRole('table', { name: 'Verbrauch' })
  await expect(consumption).toContainText('Erika Mustermann')
  // Die Tabelle passt bei 1440 px ohne horizontales Scrollen.
  expect(
    await page
      .getByRole('region', { name: 'Verbrauch horizontal scrollen' })
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
  await shotFrom(page, consumption, '04-verbrauch.png', info)

  await area(page, 'Kosten').click()
  await page
    .getByRole('button', { name: 'Datenübersicht', exact: true })
    .click()
  await expect(page.getByText('Grundsteuer').first()).toBeVisible()
  await shot(page, '05-kosten.png', info)

  await area(page, 'Heizkreise').click()
  await page.getByRole('button', { name: 'Brennstoffe', exact: true }).click()
  const deliveries = page.getByRole('region', {
    name: /Brennstofflieferungen/u,
  })
  await expect(deliveries).toContainText('10.02.2025')
  await expect(deliveries).toContainText('2.600,00')
  await shotFrom(page, deliveries, '06-brennstoffe.png', info)

  await area(page, 'Berechnung').click()
  await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
  await expect(
    page.getByRole('table', { name: 'Einzelabrechnungen im Überblick' }),
  ).toContainText('Erika Mustermann')
  await shot(page, '07-berechnung.png', info)

  await area(page, 'Freigabe').click()
  await expect(
    page.getByRole('heading', { name: 'Prüfung und Freigabe' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Prüfung starten' }).click()
  await expect(
    page.getByRole('button', { name: 'Für PDF freigeben' }),
  ).toBeEnabled()
  await shot(page, '08-freigabe.png', info)
  await page.getByRole('button', { name: 'Für PDF freigeben' }).click()

  await area(page, 'PDF und Export').click()
  await expect(
    page.getByRole('heading', { name: 'PDF und Export', level: 2 }),
  ).toBeVisible()
  await shot(page, '09-pdf-export.png', info)

  expect(errors).toEqual([])
})
