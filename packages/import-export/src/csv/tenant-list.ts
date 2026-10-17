import {
  CsvImportError,
  csvCents,
  csvDate,
  csvTable,
  decimalText,
} from './table'

/** Spalten der Vorlage „Mieterliste“ (Reihenfolge frei, Namen verbindlich). */
export const TENANT_LIST_HEADERS = [
  'Gebaeude',
  'Wohnung',
  'Lage',
  'Wohnflaeche m2',
  'Beheizte Flaeche m2',
  'Mieter',
  'E-Mail',
  'Von',
  'Bis',
  'Personen',
  'Vorauszahlung monatlich EUR',
  'Vorauszahlung jaehrlich EUR',
  'Keine Vorauszahlung',
] as const
type Header = (typeof TENANT_LIST_HEADERS)[number]

export type TenantListPrepayment =
  | { readonly mode: 'monthly'; readonly monthlyAmountCents: number }
  | { readonly mode: 'annual'; readonly annualAmountCents: number }
  | { readonly mode: 'none_agreed' }

export interface TenantListRow {
  /** Zeilennummer in der Datei (Kopfzeile = 1). */
  readonly line: number
  readonly building?: string
  readonly unit: string
  readonly location?: string
  readonly usableAreaSqm?: number
  readonly heatedAreaSqm?: number
  /** Fehlt bei Leerstand. */
  readonly tenant?: {
    readonly displayName: string
    readonly email?: string
    readonly persons?: number
    readonly prepayment: TenantListPrepayment
  }
  readonly from?: string
  readonly to?: string
}

export interface TenantListIssue {
  readonly line: number
  readonly message: string
}

export interface TenantListParseResult {
  readonly rows: TenantListRow[]
  readonly issues: TenantListIssue[]
}

/** Fiktive Beispielzeilen; keine echten Personen- oder Vertragsdaten. */
export const TENANT_LIST_TEMPLATE = [
  TENANT_LIST_HEADERS.join(';'),
  'Haus A;EG links;Erdgeschoss links;65,50;60,00;Erika Muster;;;30.06.2025;2;180,00;;',
  'Haus A;EG links;;;;Max Beispiel;;01.07.2025;;1;;2.280,00;',
  'Haus A;OG rechts;1. Obergeschoss rechts;72,00;72,00;Familie Probe;;;;3;;;ja',
  'Haus A;DG;Dachgeschoss;48,00;;;;;;;;;',
  '',
].join('\r\n')

function optional(value: string): string | undefined {
  return value ? value : undefined
}

function positiveNumber(value: string, label: string): number | undefined {
  if (!value) return undefined
  let parsed: number
  try {
    parsed = Number(decimalText(value))
  } catch {
    throw new CsvImportError(`${label} ist keine Zahl.`)
  }
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new CsvImportError(`${label} muss größer als 0 sein.`)
  return parsed
}

function date(value: string, label: string): string | undefined {
  if (!value) return undefined
  try {
    return csvDate(value)
  } catch {
    throw new CsvImportError(
      `${label}: ungültiges Datum (TT.MM.JJJJ erwartet).`,
    )
  }
}

function euro(value: string, label: string): number | undefined {
  if (!value) return undefined
  let cents: number
  try {
    cents = csvCents(value)
  } catch {
    throw new CsvImportError(`${label} ist kein gültiger Betrag.`)
  }
  if (cents < 0) throw new CsvImportError(`${label} darf nicht negativ sein.`)
  return cents
}

function noPrepaymentFlag(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('de-DE')
  if (!normalized || normalized === 'nein') return false
  if (normalized === 'ja' || normalized === 'x') return true
  throw new CsvImportError(
    'Keine Vorauszahlung: bitte „ja“, „x“ oder leer angeben.',
  )
}

function parseRow(get: (key: Header) => string, line: number): TenantListRow {
  const unit = get('Wohnung')
  if (!unit) throw new CsvImportError('Wohnung fehlt.')
  const usableAreaSqm = positiveNumber(get('Wohnflaeche m2'), 'Wohnfläche')
  const heatedAreaSqm = positiveNumber(
    get('Beheizte Flaeche m2'),
    'Beheizte Fläche',
  )
  const from = date(get('Von'), 'Von')
  const to = date(get('Bis'), 'Bis')
  if (from && to && from > to) throw new CsvImportError('Von liegt nach Bis.')
  const personsText = get('Personen')
  let persons: number | undefined
  if (personsText) {
    persons = Number(personsText.replace(',', '.'))
    if (!Number.isFinite(persons) || persons < 0)
      throw new CsvImportError('Personen muss eine Zahl ab 0 sein.')
  }
  const monthly = euro(
    get('Vorauszahlung monatlich EUR'),
    'Vorauszahlung monatlich',
  )
  const annual = euro(
    get('Vorauszahlung jaehrlich EUR'),
    'Vorauszahlung jährlich',
  )
  const none = noPrepaymentFlag(get('Keine Vorauszahlung'))
  const displayName = get('Mieter')
  const email = optional(get('E-Mail'))
  const base = {
    line,
    ...(get('Gebaeude') ? { building: get('Gebaeude') } : {}),
    unit,
    ...(get('Lage') ? { location: get('Lage') } : {}),
    ...(usableAreaSqm === undefined ? {} : { usableAreaSqm }),
    ...(heatedAreaSqm === undefined ? {} : { heatedAreaSqm }),
  }
  const range = { ...(from ? { from } : {}), ...(to ? { to } : {}) }

  if (!displayName) {
    if (
      email ||
      persons !== undefined ||
      monthly !== undefined ||
      annual !== undefined ||
      none
    )
      throw new CsvImportError(
        'Leerstand (ohne Mieter) darf keine E-Mail, Personen oder Vorauszahlung haben.',
      )
    return { ...base, ...range }
  }
  const given = [monthly !== undefined, annual !== undefined, none].filter(
    Boolean,
  ).length
  if (given === 0)
    throw new CsvImportError(
      'Vorauszahlung fehlt: Betrag monatlich oder jährlich angeben oder „Keine Vorauszahlung“ = ja.',
    )
  if (given > 1)
    throw new CsvImportError(
      'Bitte nur eine Vorauszahlungsart angeben (monatlich, jährlich oder keine).',
    )
  const prepayment: TenantListPrepayment =
    monthly !== undefined
      ? { mode: 'monthly', monthlyAmountCents: monthly }
      : annual !== undefined
        ? { mode: 'annual', annualAmountCents: annual }
        : { mode: 'none_agreed' }
  return {
    ...base,
    tenant: {
      displayName,
      ...(email ? { email } : {}),
      ...(persons === undefined ? {} : { persons }),
      prepayment,
    },
    ...range,
  }
}

/**
 * Liest die Vorlage „Mieterliste“: je Zeile eine Belegung (Mieter oder
 * Leerstand) einer Wohnung im Abrechnungsjahr. Fehler werden je Zeile
 * gesammelt; nur ein falscher Spaltenkopf bricht den Import ganz ab.
 * Keine Speicherung – die Zuordnung zu Wohnungen erfolgt in der Oberfläche.
 */
export function parseTenantListCsv(text: string): TenantListParseResult {
  const [header, ...rows] = csvTable(text)
  if (
    header!.length !== TENANT_LIST_HEADERS.length ||
    TENANT_LIST_HEADERS.some((name) => !header!.includes(name))
  )
    throw new CsvImportError(
      `Die Spalten entsprechen nicht der Vorlage „Mieterliste“. Erwartet: ${TENANT_LIST_HEADERS.join(', ')}.`,
    )
  const result: TenantListParseResult = { rows: [], issues: [] }
  rows.forEach((row, index) => {
    const line = index + 2
    try {
      result.rows.push(parseRow((key) => row[header!.indexOf(key)]!, line))
    } catch (caught) {
      result.issues.push({
        line,
        message:
          caught instanceof Error ? caught.message : 'Zeile ist ungültig.',
      })
    }
  })
  return result
}
