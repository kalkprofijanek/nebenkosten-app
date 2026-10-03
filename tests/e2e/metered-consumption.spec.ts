import { expect, test } from '@playwright/test'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  createMeteredFixture,
  meteringId,
} from '../../apps/web/src/features/metering/metered-fixture'

test('stored v4 requires confirmation and preserves original backup bytes', async ({
  page,
}) => {
  await page.goto('/')
  const source = JSON.stringify({
    ...createEmptyAppDataFile(),
    schemaVersion: 4,
    meta: { savedAt: '2026-09-28T12:00:00.000Z' },
  })
  await page.evaluate(async (json) => {
    const bytes = new TextEncoder().encode(json)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const revision = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('nebenkosten-app-v4', 1)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('current', 'readwrite')
        transaction
          .objectStore('current')
          .put(
            { bytes, revision, savedAt: '2026-09-28T12:00:00.000Z' },
            'app-data',
          )
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
      request.onerror = () => reject(request.error)
    })
  }, source)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Datenbestand auf Version 5 umstellen' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sichern und umstellen' }),
  ).toBeDisabled()
  await page.getByRole('checkbox', { name: /Umstellung auf Version 5/ }).check()
  await page.getByRole('button', { name: 'Sichern und umstellen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  const stored = await page.evaluate(
    async () =>
      new Promise<{ current: number; backups: string[] }>((resolve, reject) => {
        const request = indexedDB.open('nebenkosten-app-v4', 1)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(
            ['current', 'snapshots'],
            'readonly',
          )
          const current = transaction.objectStore('current').get('app-data')
          const snapshots = transaction.objectStore('snapshots').getAll()
          transaction.oncomplete = () => {
            resolve({
              current: JSON.parse(
                new TextDecoder().decode(current.result.bytes),
              ).schemaVersion,
              backups: snapshots.result
                .filter((s: { kind: string }) => s.kind === 'before_migration')
                .map((s: { bytes: Uint8Array }) =>
                  new TextDecoder().decode(s.bytes),
                ),
            })
            db.close()
          }
          transaction.onerror = () => reject(transaction.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
  expect(stored).toEqual({ current: 5, backups: [source] })
})

for (const width of [1440]) {
  test(`meter assignment, occupant change and correction at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/')
    await page.getByLabel('Daten importieren').setInputFiles({
      name: 'fiktive-zaehler.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(createMeteredFixture())),
    })
    await page.getByRole('button', { name: 'Import übernehmen' }).click()
    await expect(page.getByText('Lokal gespeichert')).toBeVisible()
    await page.goto('/#/heizkreise?tab=meters')
    await page.getByLabel('Wohnung für TEST-WMZ-1').selectOption(meteringId(5))
    await page.getByRole('button', { name: 'Zuordnung speichern' }).click()
    const table = page.getByRole('table', {
      name: 'Grenzablesungen je Nutzerzeitraum',
    })
    await expect(table).toContainText('400 kWh')
    await expect(table).toContainText('600 kWh')
    await page.getByRole('button', { name: 'Messverbrauch aktivieren' }).click()
    await expect(
      page.getByText('Messverbrauch aktiv', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: '2000 kWh bearbeiten', exact: true })
      .click()
    await page
      .getByLabel('Zählerstand bearbeiten', { exact: true })
      .fill('2100')
    await page.getByRole('button', { name: 'Ablesung speichern' }).click()
    await expect(table).toContainText('700 kWh')
    await expect(page.getByText('Lokal gespeichert')).toBeVisible()
    await page.reload()
    await expect(table).toContainText('700 kWh')
    await page.screenshot({
      path: info.outputPath('messverbrauch.png'),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  })
}

for (const width of [1440]) {
  test(`blocked metered calculation leads to the meter reading at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 })
    const fixture = createMeteredFixture()
    const blocked = {
      ...fixture,
      billingData: {
        ...fixture.billingData,
        heatingCircuits: fixture.billingData.heatingCircuits.map((circuit) => ({
          ...circuit,
          consumptionMode: 'metered_kwh',
          meterAssignments: [{ meterId: meteringId(7), unitId: meteringId(5) }],
        })),
        meterReadings: fixture.billingData.meterReadings.filter(
          ({ id }) => id !== meteringId(15),
        ),
      },
    }
    await page.goto('/')
    await page.getByLabel('Daten importieren').setInputFiles({
      name: 'fiktive-sperre.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(blocked)),
    })
    await page.getByRole('button', { name: 'Import übernehmen' }).click()
    await expect(page.getByText('Lokal gespeichert')).toBeVisible()
    await page.goto('/#/berechnung')
    await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Messberechnung der Wohnungswärme')
    await expect(alert).toContainText('Zähler TEST-WMZ-1')
    await expect(alert).not.toContainText('metered.')
    await alert
      .getByRole('link', { name: 'Ablesungen des Zählers bearbeiten' })
      .first()
      .click()
    await expect(page).toHaveURL(/#\/heizkreise\?tab=meters&meter=/)
    await expect(
      page.getByRole('heading', { level: 2, name: 'TEST-WMZ-1' }),
    ).toBeVisible()
    await expect(
      page.getByText('Automatische Ermittlung noch nicht möglich.'),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  })
}
