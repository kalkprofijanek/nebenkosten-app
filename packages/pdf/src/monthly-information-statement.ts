/**
 * Monatliche Verbrauchsinformation je Mieter (§ 6a Abs. 2 HeizKV, ADR-0014
 * Schritt 3). Reine Funktion: Sie stellt das Ergebnis von
 * `calculateMonthlyConsumptionInformation` dar und rechnet nichts neu.
 * Absender, Empfänger und Fensterkuvert-Positionen entsprechen der
 * Einzelabrechnung, damit der Briefversand möglich ist.
 */
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import type { AppDataFile } from '@nebenkosten/schema'
import {
  resolveShippingAddress,
  type MonthlyConsumptionInformation,
  type MonthlyInformationAssumption,
  type MonthlyTenantConsumption,
  type MonthlyValue,
} from '@nebenkosten/core'
import { buildRecipientBlock, buildSenderBlock } from './address'
import { formatIsoDate, formatNumber, formatPercent } from './format'
import {
  AVERAGE_USER_APPROXIMATION,
  MONTHLY_INFORMATION_LEGAL_BASIS,
  MONTHLY_INFORMATION_NOT_A_BILL,
  MONTHLY_INFORMATION_PARTIAL_PERIOD,
  averageUnavailableText,
  averageUserExplanation,
  hotWaterConversionText,
  notCollectedText,
} from './monthly-information-texts'
import { ADDRESS_WINDOW } from './tenant-statement'
import { MUTED } from './tenant-statement-tables'

const BLUE = '#1a3a5c'
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u

/** Kontext für die Verbrauchsinformation eines Mieters in einem Monat. */
export interface MonthlyInformationStatementContext {
  readonly appData: AppDataFile
  readonly information: MonthlyConsumptionInformation
  /** Eine Zeile aus `information.tenants`. */
  readonly tenant: MonthlyTenantConsumption
  readonly generatedAt: Date
}

interface CalendarMonth {
  readonly key: string
  readonly from: string
  readonly to: string
  readonly label: string
}

const monthFormatter = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function parseMonth(key: string): { year: number; month: number } {
  const match = MONTH_PATTERN.exec(key)
  if (!match) throw new Error(`Ungültiger Monat "${key}" (erwartet JJJJ-MM).`)
  return { year: Number(match[1]), month: Number(match[2]) }
}

function calendarMonth(key: string, offset = 0): CalendarMonth {
  const parsed = parseMonth(key)
  const start = new Date(Date.UTC(parsed.year, parsed.month - 1 + offset, 1))
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  )
  return {
    key: start.toISOString().slice(0, 7),
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label: monthFormatter.format(start),
  }
}

function range(from: string, to: string): string {
  return `${formatIsoDate(from)} bis ${formatIsoDate(to)}`
}

function kwh(value: number): string {
  return `${formatNumber(value, 0)} kWh`
}

function m3(value: number): string {
  return `${formatNumber(value, 2)} m³`
}

function plainNumber(value: number): string {
  return formatNumber(value, Number.isInteger(value) ? 0 : 2)
}

/** Wert mit Einheit; Teilzeiträume des Vergleichsmonats mit Zeitraum. */
function valueText(
  value: MonthlyValue,
  month: CalendarMonth,
  format: (value: number) => string,
): string {
  if (value.status === 'not_collected') return notCollectedText(value.reason)
  const partial = value.from !== month.from || value.to !== month.to
  return partial
    ? `${format(value.value)} (${range(value.from, value.to)})`
    : format(value.value)
}

interface Months {
  readonly current: CalendarMonth
  readonly previousMonth: CalendarMonth
  readonly previousYearMonth: CalendarMonth
}

const rowLabels = (months: Months) =>
  [
    ['current', `Ihr Verbrauch ${months.current.label}`],
    ['previousMonth', `Vormonat (${months.previousMonth.label})`],
    [
      'previousYearMonth',
      `Gleicher Monat im Vorjahr (${months.previousYearMonth.label})`,
    ],
  ] as const

function heatingTable(
  tenant: MonthlyTenantConsumption,
  months: Months,
): Content {
  const body: TableCell[][] = [
    [
      { text: 'Heizung', style: 'th' },
      { text: 'Verbrauch', style: 'th', alignment: 'right' },
    ],
    ...rowLabels(months).map(([key, label]): TableCell[] => [
      label,
      {
        text: valueText(tenant.heating[key], months[key], kwh),
        alignment: 'right',
      },
    ]),
  ]
  const average = tenant.averageUser
  if (average.status === 'compared' && average.includesHotWater)
    body.push([
      'Ihr Verbrauch Heizung und Warmwasser (zum Vergleich)',
      {
        text: average.ownKwh === null ? 'nicht erhoben' : kwh(average.ownKwh),
        alignment: 'right',
      },
    ])
  body.push([
    average.status === 'compared' && average.includesHotWater
      ? 'Durchschnittsnutzer (Heizung und Warmwasser)'
      : 'Durchschnittsnutzer',
    {
      text:
        average.status === 'compared'
          ? kwh(average.value)
          : averageUnavailableText(average.reason),
      alignment: 'right',
    },
  ])
  return {
    table: { headerRows: 1, widths: ['*', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 10],
  }
}

function hotWaterTable(
  tenant: MonthlyTenantConsumption,
  months: Months,
): Content[] {
  const hotWater = tenant.hotWater
  if (!hotWater) return []
  return [
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: [
          [
            { text: 'Warmwasser', style: 'th' },
            { text: 'Menge', style: 'th', alignment: 'right' },
            { text: 'Energie', style: 'th', alignment: 'right' },
          ],
          ...rowLabels(months).map(([key, label]): TableCell[] => [
            label,
            {
              text: valueText(hotWater[key].m3, months[key], m3),
              alignment: 'right',
            },
            {
              text: valueText(hotWater[key].kwh, months[key], kwh),
              alignment: 'right',
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 10],
    },
  ]
}

function explanations(tenant: MonthlyTenantConsumption, month: CalendarMonth) {
  const lines: string[] = [MONTHLY_INFORMATION_LEGAL_BASIS]
  const average = tenant.averageUser
  if (average.status === 'compared') {
    lines.push(
      averageUserExplanation({
        source: average.source,
        category: average.category,
        referenceYear: average.referenceYear,
        benchmark: plainNumber(average.benchmarkKwhPerSqmYear),
        area: plainNumber(average.areaSqm),
        areaLabel:
          average.areaBasis === 'heated_area'
            ? 'beheizte Fläche'
            : 'Wohnfläche',
        share: formatPercent(average.degreeDayPermille / 10),
      }),
    )
    if (average.approximation) lines.push(AVERAGE_USER_APPROXIMATION)
  }
  if (tenant.hotWater)
    lines.push(
      hotWaterConversionText(
        plainNumber(tenant.hotWater.temperatureC),
        tenant.hotWater.temperatureEstimated,
      ),
    )
  if (tenant.from !== month.from || tenant.to !== month.to)
    lines.push(MONTHLY_INFORMATION_PARTIAL_PERIOD)
  lines.push(MONTHLY_INFORMATION_NOT_A_BILL)
  return lines
}

/** Nur Annahmen, die die Werte dieses Mieters betreffen. */
function relevantAssumptions(
  assumptions: readonly MonthlyInformationAssumption[],
  tenant: MonthlyTenantConsumption,
): MonthlyInformationAssumption[] {
  return assumptions.filter(({ code }) =>
    code === 'E-46-3'
      ? tenant.averageUser.status === 'compared'
      : tenant.hotWater !== null,
  )
}

function findOrThrow<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

function resolveParties(context: MonthlyInformationStatementContext) {
  const { appData, information, tenant } = context
  const { masterData, billingData } = appData
  const property = findOrThrow(
    masterData.properties.find(({ id }) => id === information.propertyId),
    `Objekt "${information.propertyId}" nicht gefunden.`,
  )
  const ownerCompany = findOrThrow(
    masterData.ownerCompanies.find(({ id }) => id === property.ownerCompanyId),
    `Eigentümergesellschaft "${property.ownerCompanyId}" nicht gefunden.`,
  )
  const unit = findOrThrow(
    masterData.units.find(({ id }) => id === tenant.unitId),
    `Einheit "${tenant.unitId}" nicht gefunden.`,
  )
  const tenancy = findOrThrow(
    masterData.tenancies.find(({ id }) => id === tenant.tenancyId),
    `Mietverhältnis der Nutzung "${tenant.occupancyPeriodId}" nicht gefunden.`,
  )
  const occupancy = billingData.occupancyPeriods.find(
    ({ id }) => id === tenant.occupancyPeriodId,
  ) ?? { kind: 'tenant' as const }
  const persons = masterData.persons.filter(({ id }) =>
    tenancy.personIds.includes(id),
  )
  const recipient = buildRecipientBlock(
    tenancy,
    persons,
    resolveShippingAddress({
      tenancy,
      occupancy,
      property,
      // Maßgeblich ist der Monat; `movedOut` wird hier nicht ausgewertet.
      billingPeriod: { periodEnd: information.to },
    }),
  )
  return {
    sender: buildSenderBlock(ownerCompany, property),
    recipient,
    unit,
  }
}

/**
 * Baut die Verbrauchsinformation eines Mieters für einen Monat (einseitig,
 * Mindestinhalt § 6a Abs. 2 HeizKV). Wirft wie die Einzelabrechnung
 * `MissingShippingAddressError`, wenn keine Versandanschrift ermittelbar
 * ist, und einen `Error`, wenn Stammdaten zur Nutzung fehlen.
 */
export function buildMonthlyInformationStatement(
  context: MonthlyInformationStatementContext,
): TDocumentDefinitions {
  const { information, tenant } = context
  const { sender, recipient, unit } = resolveParties(context)
  const months: Months = {
    current: calendarMonth(information.month),
    previousMonth: calendarMonth(information.month, -1),
    previousYearMonth: calendarMonth(information.month, -12),
  }
  const partial =
    tenant.from !== months.current.from || tenant.to !== months.current.to
  const senderAddressLines = [sender.street, sender.postalCodeAndCity].filter(
    (line): line is string => Boolean(line),
  )
  const senderLine = [...sender.nameLines, ...senderAddressLines].join(' · ')
  const assumptions = relevantAssumptions(information.assumptions, tenant)

  return {
    pageSize: 'A4',
    pageMargins: [71, 46, 48, 58],
    info: { title: `Verbrauchsinformation ${months.current.label}` },
    footer: () => ({
      text: senderLine,
      fontSize: 7,
      color: MUTED,
      margin: [71, 0, 48, 0],
    }),
    content: [
      {
        text: senderLine,
        absolutePosition: ADDRESS_WINDOW.returnLine,
        fontSize: 7,
        decoration: 'underline',
      },
      {
        stack: [
          ...recipient.nameLines,
          recipient.street,
          recipient.postalCodeAndCity,
        ],
        absolutePosition: ADDRESS_WINDOW.recipient,
        fontSize: 10,
      },
      {
        stack: [
          { text: sender.nameLines.join('\n'), bold: true },
          ...senderAddressLines,
          ...sender.contactLines,
        ],
        absolutePosition: { x: 340, y: 46 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
        absolutePosition: { x: 340, y: 150 },
        fontSize: 9,
        alignment: 'right',
      },
      {
        text: `Verbrauchsinformation ${months.current.label}`,
        style: 'title',
        margin: [0, ADDRESS_WINDOW.titleTop - 46, 0, 4],
      },
      {
        text: `Nutzungseinheit ${unit.label ?? ''} — Zeitraum ${range(months.current.from, months.current.to)}`,
        margin: [0, 0, 0, partial ? 2 : 12],
      },
      partial
        ? {
            text: `Ihr Nutzungszeitraum: ${range(tenant.from, tenant.to)}`,
            bold: true,
            margin: [0, 0, 0, 12],
          }
        : { text: '' },
      { text: `${recipient.salutationLine},`, margin: [0, 0, 0, 6] },
      {
        text: `mit dieser Information teilen wir Ihnen Ihren Verbrauch für ${tenant.hotWater ? 'Heizung und Warmwasser' : 'Heizung'} im ${months.current.label} mit.`,
        margin: [0, 0, 0, 10],
      },
      heatingTable(tenant, months),
      ...hotWaterTable(tenant, months),
      { text: 'Erläuterungen', style: 'th', margin: [0, 4, 0, 4] },
      {
        ul: explanations(tenant, months.current),
        fontSize: 8,
        margin: [0, 0, 0, 8],
      },
      ...(assumptions.length > 0
        ? [
            { text: 'Annahmen', style: 'th', margin: [0, 4, 0, 4] } as Content,
            {
              ul: assumptions.map(({ detail }) => detail),
              fontSize: 8,
              color: MUTED,
            } as Content,
          ]
        : []),
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
    },
    defaultStyle: { fontSize: 9, color: '#1f2a36', font: 'Roboto' },
  }
}

const transliterations: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
}

function safeAsciiPart(value: string): string {
  return value
    .replace(/[äöüÄÖÜß]/gu, (char) => transliterations[char]!)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

/**
 * Dateiname der Verbrauchsinformation, z. B.
 * `Verbrauchsinformation_2026-10_Wohnung-3.pdf`. Nur ASCII-Buchstaben,
 * Ziffern, `-` und `_` (sicher für ZIP-Archive und E-Mail-Anhänge).
 */
export function monthlyInformationFileName(
  month: string,
  unitLabel: string,
): string {
  parseMonth(month)
  return `Verbrauchsinformation_${month}_${safeAsciiPart(unitLabel) || 'Einheit'}.pdf`
}
