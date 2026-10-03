import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'
import {
  calculateOccupancyDays,
  resolveShippingAddress,
  type HeatingCircuitTrace,
  type OperatingPositionTrace,
  type TenantAllocationBasis,
  type TenantCalculationResult,
} from '@nebenkosten/core'
import { buildRecipientBlock, buildSenderBlock } from './address'
import { meteringStatement } from './metering-statement'
import type { TenantStatementContext } from './contracts'
import { renderCoverLetter, type CoverLetterPlaceholders } from './cover-letter'
import {
  addDaysIso,
  balanceLabel,
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIban,
  formatIsoDate,
  formatNumber,
  formatUnitPrice,
} from './format'
import {
  amountCell,
  buildingName,
  captureModeFor,
  circuitTitle,
  co2Table,
  consumptionUnitLabel,
  energyCarrierLabel,
  fuelAccountTable,
  heatingCompilationTable,
  heatingSplitTotalsTable,
  hotWaterNotice,
  scopeLabel,
} from './heating-summary'
import {
  BALANCED_TEXT,
  CONSUMPTION_INFORMATION_HEADING,
  ENERGY_ADVICE_NOTICE,
  OBJECTION_NOTICE,
  PROPERTY_DATA_HEADING,
  TIME_FACTOR_EXPLANATION,
  additionalPaymentText,
  baseAreaLabel,
  creditText,
  estimatedConsumptionNote,
  heatingSplitExplanation,
} from './legal-texts'

const BLUE = '#1a3a5c'
const LIGHT_FILL = '#eef4fb'
const MUTED = '#5a6a78'
const PAYMENT_TERM_DAYS = 30

/** Nutzungszeitraum des Mieters, auf den Abrechnungszeitraum begrenzt. */
function occupancyRange(context: TenantStatementContext) {
  const { billingPeriod, occupancyPeriod } = context
  const from =
    occupancyPeriod.from && occupancyPeriod.from > billingPeriod.periodStart
      ? occupancyPeriod.from
      : billingPeriod.periodStart
  const to =
    occupancyPeriod.to && occupancyPeriod.to < billingPeriod.periodEnd
      ? occupancyPeriod.to
      : billingPeriod.periodEnd
  return {
    from,
    to,
    partial:
      from !== billingPeriod.periodStart || to !== billingPeriod.periodEnd,
  }
}

function resolvedBuildingId(context: TenantStatementContext) {
  const { occupancyPeriod, unit } = context
  return occupancyPeriod.costScope?.kind === 'building'
    ? occupancyPeriod.costScope.buildingId
    : unit.buildingId
}

function circuitTraceFor(context: TenantStatementContext) {
  const { calculation } = context
  const buildingId = resolvedBuildingId(context)
  return calculation.heating.trace.circuits.find(
    (circuit) => circuit.buildingId === buildingId,
  )
}

function tenantResult(
  context: TenantStatementContext,
): TenantCalculationResult {
  const { calculation, occupancyPeriod } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant) {
    throw new Error(
      `Kein Berechnungsergebnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  return tenant
}

interface TenantFacts {
  readonly days: number
  readonly periodDays: number
  readonly partial: boolean
  readonly basis: TenantAllocationBasis
}

/**
 * Nutzungstage und eigene Bezugsgrößen; ältere Rechenstände ohne Trace
 * werden aus Einheit und Nutzungszeitraum abgeleitet.
 */
function tenantFacts(
  context: TenantStatementContext,
  tenant: TenantCalculationResult,
): TenantFacts {
  const { billingPeriod, occupancyPeriod, unit, calculation } = context
  const periodDays = calculation.periodDays
  const days =
    tenant.days ??
    calculateOccupancyDays(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
      occupancyPeriod.from,
      occupancyPeriod.to,
    )
  const usable = unit.usableAreaSqm?.value ?? 0
  const basis: TenantAllocationBasis = tenant.ownBasis ?? {
    buildingId: resolvedBuildingId(context) ?? null,
    usableAreaSqm: usable,
    heatedAreaSqm: unit.heatedAreaSqm?.value || usable,
    persons: occupancyPeriod.persons?.value ?? 0,
    consumption: occupancyPeriod.consumptionUnits?.value ?? 0,
    consumptionUnit: 'Einheiten',
  }
  return { days, periodDays, partial: days !== periodDays, basis }
}

function heatingTotalCents(tenant: TenantCalculationResult): number {
  const { costBreakdown } = tenant
  return (
    costBreakdown.heatingBaseCents +
    costBreakdown.heatingConsumptionCents +
    costBreakdown.hotWaterCents
  )
}

function summaryTable(context: TenantStatementContext): Content {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const operatingCents = costBreakdown.operatingByCategory.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )
  const label = balanceLabel(tenant.balanceCents)
  const rows: [string, string][] = [
    ['Ihre Heizkosten', formatEuroCents(heatingTotalCents(tenant))],
    ['Ihr CO2-Kostenanteil', formatEuroCents(costBreakdown.heatingCo2Cents)],
    ['Ihre Betriebskosten', formatEuroCents(operatingCents)],
    ['Ihr Anteil an den Gesamtkosten', formatEuroCents(tenant.shareCents)],
    [
      'Von Ihnen geleistete Vorauszahlungen',
      formatEuroCents(tenant.prepaymentCents),
    ],
    [label, formatEuroCents(Math.abs(tenant.balanceCents))],
  ]
  return {
    table: {
      widths: ['*', 'auto'],
      body: rows.map(([left, right]) => {
        const emphasized =
          left === 'Ihr Anteil an den Gesamtkosten' || left === label
        const balanceRow = left === label
        return [
          {
            text: left,
            bold: emphasized,
            fillColor: balanceRow ? LIGHT_FILL : undefined,
          },
          {
            text: right,
            alignment: 'right',
            noWrap: true,
            bold: emphasized,
            fillColor: balanceRow ? LIGHT_FILL : undefined,
            color:
              balanceRow && tenant.balanceCents < 0 ? '#1a6a2e' : undefined,
          },
        ]
      }),
    },
    layout: 'lightHorizontalLines',
    margin: [0, 8, 0, 4],
  }
}

/** Abrechnungsdatum: Versanddatum, sonst Erstelldatum des Schreibens. */
function statementDate(context: TenantStatementContext): string {
  return (
    context.occupancyPeriod.dispatchDate ??
    context.billingPeriod.dispatchDate ??
    context.generatedAt.toISOString().slice(0, 10)
  )
}

function paymentContent(context: TenantStatementContext): Content[] {
  const tenant = tenantResult(context)
  const { billingPeriod, unit } = context
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const amount = formatEuroCents(Math.abs(tenant.balanceCents))
  const notes = billingPeriod.notes
  if (tenant.balanceCents > 0) {
    return [
      {
        text: additionalPaymentText({
          amount,
          dueDate: formatIsoDate(
            addDaysIso(statementDate(context), PAYMENT_TERM_DAYS),
          ),
          iban: sender.iban ? formatIban(sender.iban) : null,
          reference: `NK ${billingPeriod.year} ${unit.label ?? ''}`.trim(),
        }),
        margin: [0, 0, 0, 4],
      },
      ...(notes?.additionalPayment
        ? [{ text: notes.additionalPayment, margin: [0, 0, 0, 4] } as Content]
        : []),
    ]
  }
  if (tenant.balanceCents < 0) {
    return [
      { text: creditText(amount), margin: [0, 0, 0, 4] },
      ...(notes?.credit
        ? [{ text: notes.credit, margin: [0, 0, 0, 4] } as Content]
        : []),
    ]
  }
  return [{ text: BALANCED_TEXT, margin: [0, 0, 0, 4] }]
}

function basisTable(
  context: TenantStatementContext,
  facts: TenantFacts,
  circuit: HeatingCircuitTrace | undefined,
): Content {
  const rows: TableCell[][] = [
    [
      'Ihre Nutzungstage',
      `${facts.days} von ${facts.periodDays} Tagen (Zeitfaktor ${formatNumber(facts.days / facts.periodDays, 4)})`,
    ],
    ['Ihre Wohnfläche', `${formatNumber(facts.basis.usableAreaSqm)} m²`],
  ]
  if (facts.basis.heatedAreaSqm !== facts.basis.usableAreaSqm) {
    rows.push([
      'Ihre beheizte Fläche',
      `${formatNumber(facts.basis.heatedAreaSqm)} m²`,
    ])
  }
  rows.push([
    'Abrechnungseinheit',
    `Wohnanlage gesamt; Heizkosten: ${
      circuit
        ? circuitTitle(context.appData, circuit)
        : `Gebäude ${buildingName(context.appData, resolvedBuildingId(context))}`
    }`,
  ])
  return {
    table: { widths: ['*', 'auto'], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

/** Eigene Einheiten zum Umlageschlüssel einer Kostenart. */
function ownUnits(
  position: OperatingPositionTrace,
  facts: TenantFacts,
): string {
  const timeSuffix = facts.partial
    ? ` × ${facts.days}/${facts.periodDays} Tage`
    : ''
  switch (position.allocationKey) {
    case 'usable_area':
      return `${formatNumber(facts.basis.usableAreaSqm)} m²${timeSuffix}`
    case 'heated_area':
      return `${formatNumber(facts.basis.heatedAreaSqm)} m²${timeSuffix}`
    case 'residential_units':
      return `1 WE${timeSuffix}`
    case 'consumption_units':
      return facts.basis.consumptionUnit === 'Einheiten'
        ? `${formatNumber(facts.basis.consumption)} Einheiten`
        : '–'
    default:
      return '–'
  }
}

function denominatorText(position: OperatingPositionTrace): string {
  if (position.denominator == null || position.denominatorUnit == null)
    return '–'
  return `${formatNumber(position.denominator)} ${position.denominatorUnit}`
}

function legacyCostCategoryTable(context: TenantStatementContext): Content {
  const tenant = tenantResult(context)
  const categoriesById = new Map(
    context.costCategories.map((category) => [category.id, category]),
  )
  const body: TableCell[][] = [
    [
      { text: 'Kostenart', style: 'th' },
      { text: 'Schlüssel', style: 'th' },
      { text: 'Ihr Anteil', style: 'th', alignment: 'right' },
    ],
    ...tenant.costBreakdown.operatingByCategory.map((item): TableCell[] => {
      const category = categoriesById.get(item.costCategoryId)
      return [
        category?.statementText ?? category?.label ?? item.costCategoryId,
        formatAllocationKeyLabel(category?.allocationKey),
        amountCell(item.amountCents),
      ]
    }),
  ]
  return {
    table: { widths: ['*', 'auto', 'auto'], body },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  }
}

function costCategoryTable(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const tenant = tenantResult(context)
  const items = tenant.costBreakdown.operatingByCategory.filter(
    ({ amountCents }) => amountCents !== 0,
  )
  if (items.length === 0) {
    return [
      {
        text: 'Keine Betriebskosten-Positionen erfasst.',
        margin: [0, 4, 0, 8],
      },
    ]
  }
  const positions = context.calculation.operatingPositions
  if (!positions) return [legacyCostCategoryTable(context)]

  const positionsById = new Map(
    positions.map((position) => [position.costCategoryId, position]),
  )
  const rows = items.map((item): TableCell[] => {
    const position = positionsById.get(item.costCategoryId)
    if (!position) {
      return [
        item.costCategoryId,
        '–',
        '–',
        '–',
        '–',
        amountCell(item.amountCents),
      ]
    }
    return [
      {
        stack: [
          position.label,
          {
            text: scopeLabel(context.appData, position.scope),
            fontSize: 7,
            color: MUTED,
          },
        ],
      },
      amountCell(position.distributedCents),
      formatAllocationKeyLabel(position.allocationKey),
      { text: denominatorText(position), alignment: 'right', noWrap: true },
      { text: ownUnits(position, facts), alignment: 'right' },
      amountCell(item.amountCents),
    ]
  })
  const total = items.reduce((sum, item) => sum + item.amountCents, 0)
  const movedElectricity = items.some(
    (item) =>
      (positionsById.get(item.costCategoryId)
        ?.operatingElectricityDeductedCents ?? 0) !== 0,
  )
  return [
    {
      table: {
        headerRows: 1,
        widths: ['*', 62, 'auto', 58, 70, 58],
        body: [
          [
            { text: 'Kostenart', style: 'th' },
            {
              text: 'Gesamtkosten (umlagefähig)',
              style: 'th',
              alignment: 'right',
            },
            { text: 'Schlüssel', style: 'th' },
            { text: 'Gesamt-einheiten', style: 'th', alignment: 'right' },
            { text: 'Ihre Einheiten', style: 'th', alignment: 'right' },
            { text: 'Ihr Anteil', style: 'th', alignment: 'right' },
          ],
          ...rows,
          [
            { text: 'Summe Ihrer Betriebskosten', bold: true, colSpan: 5 },
            {},
            {},
            {},
            {},
            amountCell(total, { bold: true }),
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 4, 0, 2],
    },
    {
      text: `Ihr Anteil = Gesamtkosten : Gesamteinheiten × Ihre Einheiten${facts.partial ? ' × Ihre Nutzungstage : Tage des Abrechnungszeitraums' : ''}.${
        movedElectricity
          ? ' Gesamtkosten nach Abzug des in die Heizkosten umgebuchten Betriebsstroms.'
          : ''
      }`,
      fontSize: 7,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

function section12Applies(context: TenantStatementContext): boolean {
  const { occupancyPeriod } = context
  return Boolean(
    occupancyPeriod.applySection12Reduction &&
    occupancyPeriod.consumptionUnitsEstimated &&
    captureModeFor(context.calculation, resolvedBuildingId(context)) !==
      'heat_meter',
  )
}

function tenantHeatingTable(
  context: TenantStatementContext,
  circuit: HeatingCircuitTrace,
  facts: TenantFacts,
): Content {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit =
    facts.basis.consumptionUnit === 'kWh' ? 'kWh' : consumptionUnitLabel(mode)
  const ownArea =
    split.baseAreaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const basePrice =
    split.baseDenominator > 0 ? split.baseCents / split.baseDenominator : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? split.consumptionCents / split.consumptionDenominator
      : 0
  const reduction = section12Applies(context)
    ? ' × 85 % (Kürzung § 12 HeizKV)'
    : ''
  const rows: TableCell[][] = [
    [
      { text: 'Ihre Heizkosten-Aufschlüsselung', style: 'th' },
      { text: '', style: 'th' },
    ],
    [
      `Grundkosten: ${formatUnitPrice(basePrice, 'm²')} × ${formatNumber(ownArea)} m² ${baseAreaLabel(split.baseAreaBasis)} × ${facts.days}/${facts.periodDays} Tage${reduction}`,
      amountCell(costBreakdown.heatingBaseCents),
    ],
    [
      `Verbrauchskosten: ${formatUnitPrice(consumptionPrice, unit === 'kWh' ? 'kWh' : 'Einheit')} × ${formatNumber(facts.basis.consumption)} ${unit}${reduction}`,
      amountCell(costBreakdown.heatingConsumptionCents),
    ],
  ]
  if (circuit.warmWater.method !== 'none') {
    rows.push([
      `Warmwasser: ${formatEuroCents(circuit.warmWater.poolCents)} : ${formatNumber(circuit.warmWater.personTimeDenominator)} Personenjahre × Ihre Personen × Zeitfaktor`,
      amountCell(costBreakdown.hotWaterCents),
    ])
  }
  rows.push([
    { text: 'Ihre Heizkosten', bold: true },
    amountCell(heatingTotalCents(tenant), { bold: true }),
  ])
  return {
    table: { widths: ['*', 80], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 4],
  }
}

function heatingSection(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const tenant = tenantResult(context)
  const { costBreakdown } = tenant
  const heatingCents = heatingTotalCents(tenant) + costBreakdown.heatingCo2Cents
  if (heatingCents === 0) return []

  const circuit = circuitTraceFor(context)
  if (!circuit) {
    throw new Error(
      `Kein Heizkreis-Nachweis für Nutzungszeitraum "${context.occupancyPeriod.id}" gefunden.`,
    )
  }
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  return [
    {
      text: `Heizkosten – Zusammenstellung für Ihren ${circuitTitle(context.appData, circuit)} (§ 7 Abs. 2 HeizKV)`,
      style: 'th',
      margin: [0, 8, 0, 4],
    },
    fuelAccountTable(context.appData, circuit),
    heatingCompilationTable(circuit),
    { text: 'Aufteilung der Heizkosten', style: 'th', margin: [0, 4, 0, 2] },
    heatingSplitTotalsTable(circuit, mode),
    tenantHeatingTable(context, circuit, facts),
    ...hotWaterNotice(circuit),
    {
      text: heatingSplitExplanation(circuit.split.consumptionSharePercent, {
        baseAreaBasis: circuit.split.baseAreaBasis,
        captureMode: mode,
        hasCentralHotWater: circuit.warmWater.method !== 'none',
      }),
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

function co2Section(context: TenantStatementContext): Content[] {
  const tenant = tenantResult(context)
  const circuit = circuitTraceFor(context)
  if (!circuit) {
    if (resolvedBuildingId(context) != null) {
      throw new Error(
        `Kein CO2-Nachweis für Nutzungszeitraum "${context.occupancyPeriod.id}" gefunden.`,
      )
    }
    return []
  }
  return co2Table(
    context.appData,
    circuit,
    tenant.costBreakdown.heatingCo2Cents,
  )
}

/** Abrechnungs- und Verbrauchsinformationen nach § 6a HeizKV. */
function consumptionInformation(
  context: TenantStatementContext,
  facts: TenantFacts,
): Content[] {
  const circuit = circuitTraceFor(context)
  if (!circuit) return []
  const { split } = circuit
  const mode = captureModeFor(context.calculation, circuit.buildingId)
  const unit =
    facts.basis.consumptionUnit === 'kWh' ? 'kWh' : consumptionUnitLabel(mode)
  const ownArea =
    split.baseAreaBasis === 'usable_area'
      ? facts.basis.usableAreaSqm
      : facts.basis.heatedAreaSqm
  const rows: TableCell[][] = [
    [
      'Energieträger Ihres Heizkreises',
      energyCarrierLabel(context.appData, circuit),
    ],
    [
      'Ihr Verbrauch im Nutzungszeitraum',
      `${formatNumber(facts.basis.consumption)} ${unit}${
        ownArea > 0
          ? ` (${formatNumber(facts.basis.consumption / ownArea)} ${unit} je m²)`
          : ''
      }`,
    ],
  ]
  if (split.baseDenominator > 0 && split.consumptionDenominator > 0) {
    const averagePerSqm = split.consumptionDenominator / split.baseDenominator
    rows.push([
      'Durchschnittlicher vergleichbarer Nutzer (gleiche Fläche und Nutzungsdauer)',
      `${formatNumber(averagePerSqm * ownArea * (facts.days / facts.periodDays))} ${unit} (${formatNumber(averagePerSqm)} ${unit} je m²)`,
    ])
  }
  return [
    {
      text: CONSUMPTION_INFORMATION_HEADING,
      style: 'th',
      margin: [0, 8, 0, 4],
    },
    {
      table: { widths: ['*', 'auto'], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    {
      text: `Der Durchschnitt ergibt sich aus dem Gesamtverbrauch des Heizkreises (${formatNumber(split.consumptionDenominator)} ${unit}) geteilt durch die Fläche (${formatNumber(split.baseDenominator)} m² ${baseAreaLabel(split.baseAreaBasis)}). ${ENERGY_ADVICE_NOTICE}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}

function propertyDataFooter(context: TenantStatementContext): Content {
  const { billingPeriod, property } = context
  const range = occupancyRange(context)
  return {
    stack: [
      { text: PROPERTY_DATA_HEADING, style: 'th', margin: [0, 8, 0, 4] },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              'Objekt',
              [property.address?.street, property.address?.postalCodeAndCity]
                .filter(Boolean)
                .join(', ') || '–',
            ],
            [
              'Abrechnungszeitraum',
              `${formatIsoDate(billingPeriod.periodStart)} – ${formatIsoDate(billingPeriod.periodEnd)}`,
            ],
            [
              'Ihr Nutzungszeitraum',
              `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`,
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    margin: [0, 8, 0, 0],
  }
}

function recipientBlock(context: TenantStatementContext) {
  return buildRecipientBlock(
    context.tenancy,
    context.persons,
    resolveShippingAddress({
      tenancy: context.tenancy,
      occupancy: context.occupancyPeriod,
      property: context.property,
      billingPeriod: context.billingPeriod,
    }),
  )
}

function coverLetterPlaceholders(
  context: TenantStatementContext,
): CoverLetterPlaceholders {
  const {
    calculation,
    occupancyPeriod,
    unit,
    property,
    billingPeriod,
    persons,
  } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  const balance = tenant?.balanceCents ?? 0
  return {
    anrede: recipientBlock(context).salutationLine,
    name: persons.map((person) => person.displayName ?? '').join(' und '),
    nutzeinheit: unit.label ?? '',
    jahr: String(billingPeriod.year),
    objekt: property.address?.street ?? '',
    saldo: formatEuroCents(Math.abs(balance)),
    saldo_art: balanceLabel(balance),
    datum: formatIsoDate(context.generatedAt.toISOString().slice(0, 10)),
    frist: formatIsoDate(billingPeriod.dispatchDate),
  }
}

function estimationNote(context: TenantStatementContext): Content {
  const { occupancyPeriod, calculation } = context
  const metered = calculation.meteringTrace?.circuits.some((circuit) =>
    circuit.occupancies.some(
      (occupancy) => occupancy.occupancyId === occupancyPeriod.id,
    ),
  )
  if (!occupancyPeriod.consumptionUnitsEstimated || metered) return { text: '' }
  return {
    text: estimatedConsumptionNote(
      occupancyPeriod.consumptionUnitsEstimateReason,
    ),
    fontSize: 8,
    italics: true,
    margin: [0, 0, 0, 8],
  }
}

/**
 * Baut die Einzelabrechnung eines Mieters (Legacy `pdfEinzelDoc`). Wirft
 * `MissingShippingAddressError`, wenn keine Versandadresse vorliegt (durch
 * `packages/validators` bereits als Fehler vor `READY_FOR_PDF` geblockt).
 */
export function buildTenantStatement(
  context: TenantStatementContext,
): TDocumentDefinitions {
  const sender = buildSenderBlock(context.ownerCompany, context.property)
  const recipient = recipientBlock(context)
  const { billingPeriod, unit } = context
  const tenant = tenantResult(context)
  const facts = tenantFacts(context, tenant)

  const coverLetterContent: Content[] =
    billingPeriod.coverLetter?.active && billingPeriod.coverLetter.text
      ? [
          {
            text: renderCoverLetter(
              billingPeriod.coverLetter.text,
              coverLetterPlaceholders(context),
            ),
            margin: [0, 0, 0, 12],
          },
        ]
      : []

  const notes = billingPeriod.notes
  const notesContent: Content[] = notes?.general
    ? [{ text: notes.general, margin: [0, 8, 0, 0] }]
    : []

  const range = occupancyRange(context)
  const senderAddressLines = [sender.street, sender.postalCodeAndCity].filter(
    (line): line is string => Boolean(line),
  )
  const iban = sender.iban ? formatIban(sender.iban) : null
  const bankLine = iban
    ? [
        sender.accountHolder ? `Kontoinhaber: ${sender.accountHolder}` : null,
        `IBAN: ${iban}`,
        sender.bic ? `BIC: ${sender.bic}` : null,
        sender.bankName,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  const openingContent: Content[] =
    coverLetterContent.length > 0
      ? []
      : [
          {
            text: `${recipient.salutationLine},`,
            margin: [0, 0, 0, 6],
          },
          {
            text: `anbei erhalten Sie Ihre Heiz- und Hausnebenkostenabrechnung ${range.partial ? `für Ihren Nutzungszeitraum ${formatIsoDate(range.from)} bis ${formatIsoDate(range.to)}` : `für das Jahr ${billingPeriod.year}`}.`,
            margin: [0, 0, 0, 10],
          },
        ]
  const circuit = circuitTraceFor(context)

  return {
    pageSize: 'A4',
    pageMargins: [71, 46, 48, 58],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${[...sender.nameLines, ...senderAddressLines].join(' · ')}${iban ? ` · IBAN ${iban}` : ''}     Seite ${currentPage}/${pageCount}`,
      fontSize: 7,
      color: MUTED,
      margin: [71, 0, 48, 0],
    }),
    content: [
      {
        text: [...sender.nameLines, ...senderAddressLines].join(' · '),
        absolutePosition: { x: 71, y: 112 },
        fontSize: 7,
        decoration: 'underline',
      },
      {
        stack: [
          ...recipient.nameLines,
          recipient.street,
          recipient.postalCodeAndCity,
        ],
        absolutePosition: { x: 71, y: 130 },
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
        text: `Heiz- und Hausnebenkostenabrechnung ${billingPeriod.year}`,
        style: 'title',
        margin: [0, 210, 0, 4],
      },
      {
        text: `Nutzungseinheit ${unit.label ?? ''} — Abrechnungszeitraum ${formatIsoDate(billingPeriod.periodStart)} bis ${formatIsoDate(billingPeriod.periodEnd)}`,
        margin: [0, 0, 0, range.partial ? 2 : 12],
      },
      range.partial
        ? {
            text: `Ihr Nutzungszeitraum: ${formatIsoDate(range.from)} bis ${formatIsoDate(range.to)}`,
            bold: true,
            margin: [0, 0, 0, 12],
          }
        : { text: '' },
      ...openingContent,
      ...coverLetterContent,
      estimationNote(context),
      summaryTable(context),
      ...paymentContent(context),
      { text: 'Abrechnungsgrundlagen', style: 'th', margin: [0, 8, 0, 2] },
      basisTable(context, facts, circuit),
      { text: 'Betriebskosten', style: 'th', margin: [0, 8, 0, 4] },
      ...costCategoryTable(context, facts),
      ...heatingSection(context, facts),
      ...meteringStatement(context.calculation, context.occupancyPeriod.id),
      ...co2Section(context),
      ...consumptionInformation(context, facts),
      {
        text: TIME_FACTOR_EXPLANATION,
        fontSize: 8,
        color: MUTED,
        margin: [0, 0, 0, 8],
      },
      { text: OBJECTION_NOTICE, margin: [0, 0, 0, 8] },
      bankLine
        ? {
            text: `Bankverbindung: ${bankLine}`,
            margin: [0, 4, 0, 4],
          }
        : { text: '' },
      ...notesContent,
      propertyDataFooter(context),
    ],
    styles: {
      title: { fontSize: 14, bold: true, color: BLUE },
      th: { fontSize: 9, bold: true, color: BLUE },
    },
    defaultStyle: { fontSize: 9, color: '#1f2a36', font: 'Roboto' },
  }
}

export type { CoverLetterPlaceholders }
