import { expect, test } from '@playwright/test'
import { buildAppDataFile } from '../characterization/build-app-data'
import { readFile } from 'node:fs/promises'
import type { Scenario } from '../characterization/types'

for (const width of [1440]) {
  test(`guided annual billing with fictional data at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 950 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    const scenarioFile = JSON.parse(
      await readFile(
        new URL('../characterization/scenarios.json', import.meta.url),
        'utf8',
      ),
    ) as { scenarios: Scenario[] }
    const scenario = scenarioFile.scenarios.find(
      (item) => item.id === 'case-01-full-year',
    )!
    await page.getByLabel('Daten importieren').setInputFiles({
      name: 'fiktive-jahresabrechnung.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(buildAppDataFile(scenario))),
    })
    await page.getByRole('button', { name: 'Import übernehmen' }).click()
    await expect(page.getByText('Lokal gespeichert')).toBeVisible()
    await page.getByRole('link', { name: 'Jahresabrechnung starten' }).click()
    await expect(
      page.getByRole('heading', { name: '1. Objekt und Zeitraum' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Geprüft – weiter' }).click()
    await expect(
      page.getByRole('heading', { name: 'Wohnungen und Belegungen (2)' }),
    ).toBeVisible()
    await page.screenshot({
      path: info.outputPath('02-belegung.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Geprüft – weiter' }).click()
    await expect(
      page.getByRole('button', { name: 'Heizkreis anlegen' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Später prüfen – weiter' }).click()
    await expect(
      page.getByRole('button', { name: 'Zähler anlegen' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Verbrauch je Belegung bearbeiten' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Später prüfen – weiter' }).click()
    await expect(
      page.getByText('Bitte zuerst einen Heizkreis mit Energiequelle anlegen.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Später prüfen – weiter' }).click()
    await expect(
      page.getByRole('heading', { name: '6. Kosten und Belege' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Geprüft – weiter' }).click()
    await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
    await expect(
      page.getByRole('table', { name: 'Einzelabrechnungen im Überblick' }),
    ).toContainText('Nachzahlung 120,00')
    await expect(page.getByText('Lokal gespeichert')).toBeVisible()
    await page.screenshot({
      path: info.outputPath('07-vorschau.png'),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.getByRole('button', { name: 'Geprüft – weiter' }).click()
    await expect(
      page.getByRole('heading', { name: 'Prüfung und Freigabe' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'JSON-Sicherung erstellen' }),
    ).toBeVisible()
    await page.screenshot({
      path: info.outputPath('08-pruefung.png'),
      fullPage: true,
    })
    await page.getByRole('link', { name: 'JSON-Sicherung erstellen' }).click()
    await expect(
      page.getByRole('button', { name: 'JSON-Sicherung herunterladen' }),
    ).toBeEnabled()
    expect(errors).toEqual([])
  })
}
