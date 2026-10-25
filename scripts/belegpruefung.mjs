#!/usr/bin/env node
/**
 * Belegprüfung gegen den Rechnungsordner je Objekt (PR-40/41). Prüft, ob zu
 * den angesetzten Kosten eines Jahres eine Rechnung im verknüpften Ordner
 * liegt, und listet Dateien ohne Kostenposition. Nur lesend: Weder die
 * Datendatei noch der Ordner werden verändert.
 *
 * Aufruf:
 *   pnpm belegpruefung <datendatei.json> [--jahr 2025]
 *     [--zuordnung private-data/objekt-ordner.json] [--json <datei>]
 *     [--erfassungsliste <ki-erfassungsliste.csv>]
 *
 * Die Zuordnung Objekt → Ordner liegt nur lokal (nie im Repository):
 *   { "version": 1, "objects": [{ "propertyId": "…", "invoiceFolder": "…" }] }
 *
 * Verknüpft wird über „Belegnummer/Dateiname“ der Kostenposition bzw.
 * Brennstofflieferung (Pfad im Ordner, Dateiname oder Dateiname ohne Endung).
 * Das Abrechnungsjahr einer nicht zugeordneten Rechnung ergibt sich aus ihrem
 * Leistungszeitraum – diese Dateien werden daher jahresunabhängig gelistet.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
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
    'Aufruf: pnpm belegpruefung <datendatei.json> [--jahr 2025] [--zuordnung private-data/objekt-ordner.json] [--json <datei>] [--erfassungsliste <ki-erfassungsliste.csv>]',
  )
  process.exit(2)
}
const mappingPath = option('--zuordnung') ?? 'private-data/objekt-ordner.json'
const jsonOut = option('--json')
const amountListPath = option('--erfassungsliste')
const euro = (cents) =>
  ((cents ?? 0) / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

/** Systemdateien und Office-Sperrdateien gehören nicht zu den Belegen. */
const ignored = (name) =>
  name.startsWith('.') ||
  name.startsWith('~$') ||
  ['thumbs.db', 'desktop.ini'].includes(name.toLowerCase())

async function listFiles(folder) {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile() && !ignored(entry.name))
    .map((entry) =>
      relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'),
    )
    .sort((a, b) => a.localeCompare(b, 'de'))
}

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

  const bytes = await readFile(input)
  const parsed = JSON.parse(new TextDecoder().decode(bytes))
  let data
  if (typeof parsed?.schemaVersion === 'number' && parsed.schemaVersion >= 4) {
    data = (await io.decodeSupportedAppDataBytes(bytes)).data
  } else {
    const imported = await io.importLegacyV3Bytes(bytes, {
      sourceFileName: basename(input),
      appVersion: 'cli',
    })
    if (!imported.ok) {
      console.error(`Import fehlgeschlagen (${imported.reason}).`)
      process.exit(1)
    }
    data = imported.data
  }

  let mapping
  try {
    mapping = validators.parseReceiptFolderMapping(
      JSON.parse(await readFile(mappingPath, 'utf8')),
    )
  } catch (error) {
    console.error(
      error.code === 'ENOENT'
        ? `Zuordnungsdatei ${mappingPath} fehlt. Vorlage: docs/BELEGPRUEFUNG.md`
        : error.message,
    )
    process.exit(2)
  }

  const periods = data.billingData.billingPeriods
  const year = Number(
    option('--jahr') ?? Math.max(...periods.map((period) => period.year)),
  )
  if (!Number.isInteger(year)) {
    console.error('--jahr erwartet eine Jahreszahl.')
    process.exit(2)
  }

  const categories = new Map(
    data.billingData.costCategories.map((category) => [category.id, category]),
  )
  const entries = new Map(
    data.billingData.costEntries.map((entry) => [entry.id, entry]),
  )
  const deliveries = new Map(
    data.billingData.fuelDeliveries.map((delivery) => [delivery.id, delivery]),
  )
  const describe = ({ kind, id }) => {
    if (kind === 'costEntry') {
      const entry = entries.get(id)
      const category = categories.get(entry?.costCategoryId)
      return `${category?.label ?? 'Kostenart ?'} · ${entry?.description ?? '–'} · ${euro(entry?.amountCents)} €`
    }
    const delivery = deliveries.get(id)
    return `Brennstofflieferung ${delivery?.date ?? ''} · ${delivery?.description ?? '–'} · ${euro(delivery?.amountCents)} €`
  }
  const propertyLabel = (property) =>
    property?.address?.street ??
    property?.internalNumber ??
    property?.id ??
    'Objekt ?'

  // Betragsabgleich (E-41-2): unabhängig gelesene Rechnungsbeträge im
  // Format der KI-Erfassungsliste (docs/KI-ANLEITUNG.md).
  let receipts = null
  if (amountListPath) {
    const rows = io.parseAiCostCsv(await readFile(amountListPath, 'utf8'))
    receipts = rows
      .filter((row) => row.receiptReference)
      .map((row) => ({
        receiptReference: row.receiptReference,
        amountCents: row.amountCents,
        ...(row.serviceFrom ? { serviceFrom: row.serviceFrom } : {}),
        ...(row.serviceTo ? { serviceTo: row.serviceTo } : {}),
      }))
    const withoutReference = rows.length - receipts.length
    if (withoutReference > 0)
      console.log(
        `Erfassungsliste: ${withoutReference} Zeile(n) ohne Belegnummer – im Betragsabgleich nicht berücksichtigt.`,
      )
  }

  const report = []
  let findings = 0
  for (const period of periods.filter((candidate) => candidate.year === year)) {
    const property = data.masterData.properties.find(
      ({ id }) => id === period.propertyId,
    )
    const mapped = mapping.get(period.propertyId)
    // Relative Pfade gelten relativ zur Zuordnungsdatei.
    const folder = mapped && resolve(dirname(mappingPath), mapped)
    console.log(`\n=== ${propertyLabel(property)} · ${year} ===`)
    if (!folder) {
      console.log(
        `Kein Rechnungsordner zugeordnet (propertyId ${period.propertyId}).`,
      )
      report.push({ billingPeriodId: period.id, folderMissing: true })
      findings += 1
      continue
    }
    let files
    try {
      files = await listFiles(folder)
    } catch (error) {
      console.log(`Ordner nicht lesbar: ${error.code ?? error.message}`)
      report.push({ billingPeriodId: period.id, folderUnreadable: true })
      findings += 1
      continue
    }
    const result = validators.checkReceiptFolder(data, {
      billingPeriodId: period.id,
      files,
    })
    report.push({ billingPeriodId: period.id, ...result })
    findings +=
      result.withoutReference.length +
      result.notFound.length +
      result.duplicates.length +
      result.unreferencedFiles.length
    console.log(
      `${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} im Ordner, ${result.matched.length} ${result.matched.length === 1 ? 'Beleg' : 'Belege'} zugeordnet.`,
    )
    const section = (title, lines) => {
      if (lines.length === 0) return
      console.log(`\n${title} (${lines.length}):`)
      for (const line of lines) console.log(`  - ${line}`)
    }
    section('Kosten ohne Belegangabe', result.withoutReference.map(describe))
    section(
      'Beleg nicht im Ordner gefunden',
      result.notFound.map(
        (item) => `${describe(item)} → „${item.receiptReference}“`,
      ),
    )
    section(
      'Beleg mehrfach angesetzt (bei Aufteilung auf Kostenarten korrekt)',
      result.duplicates.map(
        ({ file, sources }) => `${file}: ${sources.map(describe).join(' | ')}`,
      ),
    )
    section(
      'Dateien ohne Kostenposition – Leistungszeitraum prüfen',
      result.unreferencedFiles,
    )
    if (receipts) {
      const amounts = validators.compareReceiptAmounts(data, {
        billingPeriodId: period.id,
        receipts,
      })
      report.at(-1).amounts = amounts
      findings += amounts.mismatches.length + amounts.notBooked.length
      console.log(
        `\nBetragsabgleich: ${amounts.matched} ${amounts.matched === 1 ? 'Rechnung stimmt' : 'Rechnungen stimmen'} überein.`,
      )
      section(
        'Betrag weicht ab (Kosten − Beleg)',
        amounts.mismatches.map(
          (item) =>
            `${item.receiptReference}: Beleg ${euro(item.receiptAmountCents)} €, angesetzt ${euro(item.bookedAmountCents)} €, Differenz ${euro(item.differenceCents)} €${
              item.partialPeriod
                ? ` – Leistungszeitraum ${item.serviceFrom ?? '?'} bis ${item.serviceTo ?? '?'} reicht über das Jahr hinaus, anteilige Abgrenzung prüfen`
                : ''
            }`,
        ),
      )
      section(
        'Beleg laut Erfassungsliste, aber keine Kostenposition',
        amounts.notBooked,
      )
    }
  }
  if (report.length === 0) console.log(`Kein Abrechnungszeitraum ${year}.`)
  else
    console.log(
      `\n${findings === 0 ? 'Keine Auffälligkeiten.' : `${findings} Punkte zur Prüfung.`} Daten und Ordner wurden nicht verändert.`,
    )
  if (jsonOut)
    await writeFile(jsonOut, JSON.stringify({ year, report }, null, 2))
} finally {
  await server.close()
}
