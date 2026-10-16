#!/usr/bin/env node
/**
 * Abrechnung ohne Browser: Import (Legacy v3), Berechnung, fachliche Prüfung
 * und PDF-Erzeugung mit genau derselben Fachlogik wie die App. Gedacht für
 * die Arbeit mit einem KI-Coding-Agenten (z. B. Claude Code) auf einer
 * lokalen Kopie der Daten – siehe docs/KI-ANLEITUNG.md.
 *
 * Aufruf:
 *   pnpm abrechnung <nk-daten.json> [--jahr 2025] [--out <ordner>] [--json <datei>] [--overlay <modul.mjs>]
 *
 * Ohne --out werden nur Summen, Heizkreise, Salden und Prüfhinweise
 * ausgegeben. Mit --json zusätzlich eine maschinenlesbare Zusammenfassung.
 * Die Eingabedatei wird nie verändert.
 *
 * --overlay: Der Legacy-v3-Import setzt die neueren Felder (z. B.
 * `section9bAllocation`, `hotWaterEnergy`, `taxesAndLevies`) nicht. Ein
 * Overlay-Modul außerhalb des Repositorys kann sie nach dem Import setzen:
 * `export default function (data, { year }) { … }` verändert `data` oder gibt
 * einen neuen Datenstand zurück. Das Ergebnis wird erneut gegen das
 * Dateischema geprüft.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`Option ${name} braucht einen Wert.`)
    process.exit(2)
  }
  return value
}
const input = args.find(
  (arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'),
)
if (!input) {
  console.error(
    'Aufruf: pnpm abrechnung <nk-daten.json> [--jahr 2025] [--out <ordner>] [--json <datei>] [--overlay <modul.mjs>]',
  )
  process.exit(2)
}
const outDir = option('--out')
const jsonOut = option('--json')
const overlayPath = option('--overlay')
const euro = (cents) =>
  (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const server = await createServer({
  root: process.cwd(),
  configFile: false,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  const load = (path) => server.ssrLoadModule(path)
  const io = await load('/packages/import-export/src/index.ts')
  const validators = await load('/packages/validators/src/index.ts')
  const core = await load('/packages/core/src/index.ts')
  const pdf = await load('/packages/pdf/src/index.ts')
  const context = await load('/apps/web/src/features/pdf/context.ts')
  const names = await load('/apps/web/src/features/pdf/file-names.ts')
  const { buildTenantStatementWithAdjustment } = await load(
    '/apps/web/src/features/prepayments/statement-with-adjustment.ts',
  )

  const imported = await io.importLegacyV3Bytes(await readFile(input), {
    sourceFileName: basename(input),
    appVersion: 'cli',
  })
  if (!imported.ok) {
    const errors = (imported.issues ?? []).filter(
      (issue) => issue.severity === 'error',
    )
    console.error(`Import fehlgeschlagen (${imported.reason}):`)
    for (const issue of errors)
      console.error(
        `  ${issue.code}: ${issue.title} [${issue.path?.join('.') ?? ''}]`,
      )
    process.exit(1)
  }
  let data = imported.data
  const year = Number(
    option('--jahr') ??
      Math.max(...data.billingData.billingPeriods.map((period) => period.year)),
  )
  if (!Number.isInteger(year))
    throw new Error('--jahr erwartet eine Jahreszahl.')
  if (overlayPath) {
    const overlay = await import(pathToFileURL(resolve(overlayPath)).href)
    if (typeof overlay.default !== 'function')
      throw new Error('--overlay: Modul braucht eine Default-Funktion.')
    data = (await overlay.default(data, { year })) ?? data
    const schema = await load('/packages/schema/src/index.ts')
    const parsed = schema.appDataFileSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Overlay erzeugt ungültige Daten:')
      for (const issue of parsed.error.issues.slice(0, 20))
        console.error(`  ${issue.path.join('.')}: ${issue.message}`)
      process.exit(1)
    }
    data = parsed.data
    console.log(`Overlay angewendet: ${basename(overlayPath)}`)
  }
  const periods = data.billingData.billingPeriods
  const period = periods.find((candidate) => candidate.year === year)
  if (!period) throw new Error(`Kein Abrechnungszeitraum ${year} gefunden.`)

  const result = core.calculateBilling(
    core.createCalculationInput(data, period.id),
  )
  const { totals } = result
  console.log(`Abrechnung ${year}`)
  console.log(
    `  Kosten ${euro(totals.recordedCostsCents)} € · Vorauszahlungen ${euro(totals.prepaymentsCents)} € · Kontrolldifferenz ${euro(totals.controlDifferenceCents)} €`,
  )
  for (const circuit of result.heating.trace.circuits) {
    const split = circuit.split
    console.log(
      `  Heizkreis ${circuit.buildingId}: ${split?.areaOnlySection9a ? 'nur Fläche (§ 9a Abs. 2 HeizKV)' : `${split?.consumptionSharePercent ?? '–'} % nach Verbrauch`}, geschätzt ${(split?.estimatedAreaSharePercent ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} % der Fläche`,
    )
  }

  const tenants = result.tenants.filter((tenant) => !tenant.isVacancy)
  const payments = tenants.filter((tenant) => tenant.balanceCents > 0)
  const credits = tenants.filter((tenant) => tenant.balanceCents < 0)
  const sum = (list) =>
    list.reduce((total, tenant) => total + tenant.balanceCents, 0)
  console.log(
    `  Nachzahlungen ${payments.length} (${euro(sum(payments))} €) · Guthaben ${credits.length} (${euro(-sum(credits))} €)`,
  )

  const report = validators.validateBillingPeriod(data, period.id)
  console.log(
    `Prüfung: ${report.errorCount} Fehler, ${report.warningCount} Warnungen`,
  )
  const grouped = new Map()
  for (const issue of report.issues.filter(
    (entry) => entry.severity !== 'info',
  )) {
    const key = `${issue.severity} ${issue.code} | ${issue.title}`
    grouped.set(key, [...(grouped.get(key) ?? []), issue.detail ?? ''])
  }
  for (const [key, details] of grouped) {
    console.log(`  [${details.length}] ${key}`)
    for (const detail of details.slice(0, 3))
      console.log(`      ${detail.slice(0, 140)}`)
  }

  let written = 0
  const failures = []
  if (outDir) {
    const require = createRequire(join(process.cwd(), 'apps/web/package.json'))
    const pdfMake = require('pdfmake/build/pdfmake.js')
    pdfMake.addVirtualFileSystem(require('pdfmake/build/vfs_fonts.js'))
    await mkdir(outDir, { recursive: true })
    const save = async (fileName, document) => {
      await writeFile(
        join(outDir, fileName),
        await pdfMake.createPdf(document).getBuffer(),
      )
      written++
    }
    const usedFileNames = new Set()
    for (const occupancy of context.tenantOccupancies(data, period.id)) {
      try {
        const statement = context.buildTenantStatementContext(
          data,
          period,
          result,
          occupancy,
        )
        await save(
          names.uniqueFileName(
            names.tenantStatementFileName(
              year,
              statement.unit.label ?? occupancy.unitId,
              statement.persons.map((person) => person.displayName),
            ),
            usedFileNames,
          ),
          buildTenantStatementWithAdjustment(statement),
        )
      } catch (error) {
        failures.push(
          `${occupancy.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    for (const audience of ['internal', 'tenant']) {
      try {
        await save(
          names.combinedStatementFileName(year, audience),
          pdf.buildCombinedCostStatement(
            context.buildCombinedCostStatementContext(
              data,
              period,
              result,
              audience,
            ),
          ),
        )
      } catch (error) {
        failures.push(
          `Gesamtabrechnung ${audience}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    console.log(
      `PDFs: ${written} geschrieben nach ${outDir}, ${failures.length} Fehler`,
    )
    for (const failure of failures) console.log(`  FEHLER ${failure}`)
  }

  if (jsonOut)
    await writeFile(
      jsonOut,
      JSON.stringify(
        {
          year,
          totals,
          tenants: tenants.map((tenant) => ({
            id: tenant.id,
            shareCents: tenant.shareCents,
            prepaymentCents: tenant.prepaymentCents,
            balanceCents: tenant.balanceCents,
          })),
          issues: report.issues,
        },
        null,
        2,
      ),
    )
  if (report.errorCount > 0 || failures.length > 0) process.exitCode = 1
} finally {
  await server.close()
}
