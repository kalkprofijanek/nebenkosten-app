import { readFile } from 'node:fs/promises'
import {
  encodeCurrentAppData,
  importLegacyV3Bytes,
} from '@nebenkosten/import-export'
import { expect, test } from '@playwright/test'

function fictionalLegacyV3() {
  return {
    version: 3,
    gespeichert: '2026-01-15T10:00:00.000Z',
    zukunftsfeld: { hinweis: 'wird konserviert' },
    firmen: [
      {
        id: 'firma-pr12-test',
        name1: 'Fiktive Testverwaltung',
        strasse: 'Musterweg',
        plz_ort: '12345 Beispielstadt',
        bank: {
          iban: ['DE89', '370400440532013000'].join(''),
          kontoinhaber: 'Fiktive Testverwaltung',
        },
        objekte: [
          {
            id: 'objekt-pr12-test',
            eigene_nr: 'PR12-TEST',
            strasse: 'Beispielweg',
            plz_ort: '12345 Beispielstadt',
            bloecke: [
              {
                id: 'B1',
                name: 'Fiktives Haus',
                prefix: ['FT'],
              },
            ],
            buchungen: [
              {
                id: 'buchung-pr14-test',
                datum: '2026-06-02',
                betrag: -100,
                auftraggeber: 'Fiktiver Dienstleister',
                verwendungszweck: 'Fiktive Betriebskosten 2026',
                buchungstext: 'LASTSCHRIFT',
                kategorie: 'NK_UMLEGBAR',
                kostenart_id: 'kosten-pr12-test',
                abr_jahr: 2026,
                _geprueft: true,
              },
            ],
            abrechnungen: [
              {
                id: 'jahr-pr12-test',
                jahr: 2026,
                zeitraum: {
                  von: '2026-01-01',
                  bis: '2026-12-31',
                },
                status: 'Entwurf',
                nutzer: [
                  {
                    id: 'nutzung-pr12-test',
                    nr: 1,
                    aktiv: 'J',
                    name: 'Fiktive Testperson',
                    nutzeinheit: 'WE 1',
                    mandatsref: 'FT_001',
                    flaeche_nf: 60,
                    personen: 1,
                    keine_vz_vereinbart: true,
                    versand_strasse: 'Musterweg',
                    versand_plz_ort: '12345 Beispielstadt',
                  },
                ],
                kostenarten: [
                  {
                    id: 'kosten-pr12-test',
                    typ: 'betrieb',
                    bezeichnung: 'Fiktive Betriebskosten',
                    kostentext: 'Fiktive Betriebskosten',
                    betrKV_kat: 'VERSICHERUNG',
                    umlage_nach: 'm2_nf',
                    betrag: 100,
                    rechnungen: [
                      {
                        datum: '2026-06-01',
                        bezeichnung: 'Fiktive Rechnung',
                        betrag: 100,
                        beleg: 'TEST-1',
                        _extern_ok: true,
                        _extern_grund: 'Fiktiver E2E-Zahlungsnachweis',
                      },
                    ],
                  },
                ],
                heizkreise: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

function findUndefinedPaths(value: unknown, path = '$'): readonly string[] {
  if (value === undefined) return [path]
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    findUndefinedPaths(child, `${path}.${key}`),
  )
}

test('produces a persistable v4 file from the fictional v3 source', async () => {
  const source = Buffer.from(JSON.stringify(fictionalLegacyV3()))
  const migration = await importLegacyV3Bytes(source, {
    sourceFileName: 'pr12-fiktiv-v3.json',
    appVersion: 'pr12-e2e',
  })

  expect(migration.ok).toBe(true)
  if (!migration.ok) throw new Error('Fiktive v3-Migration erwartet')

  expect(findUndefinedPaths(migration.data)).toEqual([])
  await expect(
    encodeCurrentAppData(migration.data, {
      savedAt: new Date('2026-01-15T10:00:00.000Z'),
    }),
  ).resolves.toMatchObject({
    data: { schemaVersion: 4 },
    revision: expect.stringMatching(/^[a-f0-9]{64}$/u),
  })
})

test('migrates fictional v3 data, exports a v4 backup, and proves rollback', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'pr12-fiktiv-v3.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fictionalLegacyV3())),
  })

  await expect(
    page.getByRole('heading', { name: 'Migrationsbericht' }),
  ).toBeVisible()
  await expect(page.getByText('Schema 3')).toBeVisible()
  await expect(page.getByText('Schema 4')).toBeVisible()
  await expect(page.getByText(/^[a-f0-9]{64}$/u)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Fachliche Plausibilitätsprüfung' }),
  ).toBeVisible()
  await expect(page.getByText('<unknown-field>', { exact: true })).toBeVisible()

  await page
    .getByRole('button', { name: 'Geprüften Import übernehmen' })
    .click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Kostenpositionen (1)' }),
  ).toBeVisible()
  await expect(page.getByText('Fiktive Rechnung')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Bankbuchungen (1)' }),
  ).toBeVisible()
  await expect(page.getByText('Fiktiver Dienstleister')).toBeVisible()
  await expect(page.getByText('Fiktive Betriebskosten 2026')).toBeVisible()

  await page.getByRole('link', { name: 'Berechnung', exact: true }).click()
  await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
  await expect(page.getByText('Erfasste Kosten')).toBeVisible()

  await page.getByRole('link', { name: 'Freigabe', exact: true }).click()
  await page.getByRole('button', { name: 'Prüfung starten' }).click()
  await expect(page.getByText('In Prüfung', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Für PDF freigeben' }).click()
  await expect(page.getByText('PDF-bereit', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'PDF und Export', exact: true }).click()
  const combinedDownload = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Gesamtabrechnung (PDF)', exact: true })
    .click()
  const combined = await combinedDownload
  const combinedPath = await combined.path()
  expect(combinedPath).not.toBeNull()
  const combinedBytes = await readFile(combinedPath!)
  expect(combinedBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  const zipDownload = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Alle Einzelabrechnungen (ZIP)',
      exact: true,
    })
    .click()
  const zip = await zipDownload
  expect(zip.suggestedFilename()).toBe('NK_2026_Einzel-PDFs.zip')
  const zipPath = await zip.path()
  expect(zipPath).not.toBeNull()
  const zipBytes = await readFile(zipPath!)
  expect(zipBytes.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004')
  expect(zipBytes.toString('latin1')).toMatch(/NK_2026_WE_1_.*\.pdf/u)

  await page.getByRole('link', { name: 'Sicherung', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'JSON-Sicherung herunterladen' }),
  ).toBeEnabled()
  const backupDownload = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'JSON-Sicherung herunterladen' })
    .click()
  const backup = await backupDownload
  expect(backup.suggestedFilename()).toMatch(
    /^nebenkosten-backup-v4-\d{8}-\d{6}\.json$/u,
  )
  const backupPath = await backup.path()
  expect(backupPath).not.toBeNull()
  const backupJson = JSON.parse(await readFile(backupPath!, 'utf8')) as {
    schemaVersion: number
    billingData: { calculationResults: unknown[]; documents: unknown[] }
  }
  expect(backupJson.schemaVersion).toBe(4)
  expect(backupJson.billingData.calculationResults).toHaveLength(1)
  expect(backupJson.billingData.documents).toHaveLength(3)
  await expect(page.getByLabel('Backup-Nachweis')).toContainText('SHA-256')

  await page.getByRole('button', { name: 'Manuellen Snapshot anlegen' }).click()
  await expect(page.getByText('Manuell')).toBeVisible()

  await page.getByRole('link', { name: 'Freigabe', exact: true }).click()
  await page
    .getByLabel('Grund für das Wiederöffnen')
    .fill('Fiktive Änderung für den Wiederherstellungstest')
  await page.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(page.getByText('In Prüfung', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Zusätzlicher Testmandant')
  await page.getByLabel('Firmenname').fill('Zusätzliche Testfirma')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(page.getByText('Zusätzliche Testfirma').last()).toBeVisible()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByRole('link', { name: 'Sicherung', exact: true }).click()
  await page
    .getByRole('button', { name: 'Diesen Stand wiederherstellen' })
    .first()
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Wiederherstellung bestätigen' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Verbindlich wiederherstellen' })
    .click()

  await expect(
    page.getByText('Sicherung vor Wiederherstellung nachgewiesen'),
  ).toBeVisible()
  await expect(page.getByText(/before_restore/u)).toBeVisible()
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await expect(page.getByText('Zusätzliche Testfirma')).toHaveCount(0)
})
