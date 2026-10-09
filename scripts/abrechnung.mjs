#!/usr/bin/env node
/**
 * Abrechnung ohne Browser: Import (Legacy v3), Berechnung, fachliche Prüfung
 * und PDF-Erzeugung mit genau derselben Fachlogik wie die App. Gedacht für
 * die Arbeit mit einem KI-Coding-Agenten (z. B. Claude Code) auf einer
 * lokalen Kopie der Daten – siehe docs/KI-ANLEITUNG.md.
 *
 * Aufruf:
 *   pnpm abrechnung <nk-daten.json> [--jahr 2025] [--out <ordner>] [--json <datei>]
 *
 * Ohne --out werden nur Summen, Heizkreise, Salden und Prüfhinweise
 * ausgegeben. Mit --json zusätzlich eine maschinenlesbare Zusammenfassung.
 * Die Eingabedatei wird nie verändert.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const input = args.find(
  (arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'),
)
if (!input) {
  console.error(
    'Aufruf: pnpm abrechnung <nk-daten.json> [--jahr 2025] [--out <ordner>] [--json <datei>]',
  )
  process.exit(2)
}
const outDir = option('--out')
const jsonOut = option('--json')
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

  const imported = await io.importLegacyV3Bytes(await readFile(input), {
    sourceFileName: basename(input),
    appVersion: 'cli',
  })
  const data = imported.data
  const periods = data.billingData.billingPeriods
  const year = Number(
    option('--jahr') ?? Math.max(...periods.map((period) => period.year)),
  )
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
    for (const occupancy of context.tenantOccupancies(data, period.id)) {
      try {
        const unit = data.masterData.units.find(
          ({ id }) => id === occupancy.unitId,
        )
        const label = (unit?.label ?? occupancy.id).replace(
          /[^\wäöüÄÖÜß]+/gu,
          '_',
        )
        await save(
          `NK${year}_${label}_${occupancy.id.slice(-6)}.pdf`,
          pdf.buildTenantStatement(
            context.buildTenantStatementContext(
              data,
              period,
              result,
              occupancy,
            ),
          ),
        )
      } catch (error) {
        failures.push(`${occupancy.id}: ${error.message}`)
      }
    }
    for (const audience of ['internal', 'tenant']) {
      try {
        await save(
          `Gesamtabrechnung_${year}_${audience}.pdf`,
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
        failures.push(`Gesamtabrechnung ${audience}: ${error.message}`)
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
