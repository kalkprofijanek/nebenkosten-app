import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  isGridEnergySource,
  type CalculationOutput,
  type EnergySourceCalculationTrace,
  type FuelLotTrace,
  type HeatingCircuitTrace,
} from '@nebenkosten/core'
import type {
  AllocationScope,
  AppDataFile,
  CostCategory,
  CostEntry,
  EnergySource,
  Property,
} from '@nebenkosten/schema'
import {
  formatEuroCents,
  formatIsoDate,
  formatNumber,
  formatPercent,
  formatQuantityUnit,
  formatUnitPrice,
} from './format'
import {
  CO2_COST_ALLOCATION_HEADING,
  NO_BEHG_CO2_COSTS,
  baseAreaLabel,
  co2DistributionSentence,
  co2LandlordDeductedSentence,
  type ConsumptionCaptureMode,
} from './legal-texts'

const MUTED = '#5a6a78'

/** Rechtsbündige Betragszelle ohne Zeilenumbruch. */
export function amountCell(
  cents: number,
  options: { readonly bold?: boolean; readonly prefix?: string } = {},
): TableCell {
  return {
    text: `${options.prefix ?? ''}${formatEuroCents(cents)}`,
    alignment: 'right',
    noWrap: true,
    bold: options.bold,
  }
}

export function buildingName(
  appData: AppDataFile,
  buildingId: string | null | undefined,
): string {
  if (!buildingId) return 'ohne Gebäudezuordnung'
  const building = appData.masterData.buildings.find(
    ({ id }) => id === buildingId,
  )
  return building?.name ?? buildingId
}

/**
 * Bezeichnung des Objekts als Abrechnungseinheit: Objektanschrift (Straße),
 * sonst interne bzw. externe Objektnummer.
 */
export function propertyUnitLabel(
  property: Property | null | undefined,
): string {
  const name =
    property?.address?.street?.trim() ||
    property?.internalNumber?.trim() ||
    property?.externalNumber?.trim()
  return name ? `Objekt ${name}` : 'Wohnanlage gesamt'
}

/**
 * Abrechnungseinheit einer Kostenart (Objekt, Gebäude, Haus). Ohne
 * `property` bleibt es bei „Wohnanlage gesamt“ (kompatibel).
 */
export function scopeLabel(
  appData: AppDataFile,
  scope: AllocationScope | null | undefined,
  property?: Property | null,
): string {
  if (!scope || scope.kind === 'property') return propertyUnitLabel(property)
  if (scope.kind === 'building')
    return `Gebäude ${buildingName(appData, scope.buildingId)}`
  return `Haus ${scope.houseKey}`
}

export function circuitTitle(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  return `Heizkreis ${buildingName(appData, circuit.buildingId)}`
}

function energySourceFor(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): EnergySource | undefined {
  return appData.billingData.energySources.find(
    ({ id }) => id === trace.energySourceId,
  )
}

function sourceLabel(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): string {
  const source = energySourceFor(appData, trace)
  return source?.name ?? source?.sourceType ?? source?.key ?? 'Energiequelle'
}

function carrierName(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): string | null {
  const source = energySourceFor(appData, trace)
  return source?.sourceType ?? source?.name ?? source?.key ?? null
}

/** Energieträger eines Heizkreises (Namen bzw. Art der Energiequellen). */
export function energyCarrierLabel(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  const labels = [
    ...new Set(
      circuit.energySources.map((trace) => carrierName(appData, trace)),
    ),
  ].filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join(', ') : 'nicht angegeben'
}

/**
 * Energieeinsatz einer Energiequelle in kWh: Heizwert × Verbrauch bzw. bei
 * Abrechnung in kWh (Strom, Fernwärme) die abgerechnete Menge selbst.
 */
function energyInputKwh(trace: EnergySourceCalculationTrace): number {
  if (trace.energyKwh > 0) return trace.energyKwh
  return trace.quantityUnit === 'kWh' ? trace.consumedQuantity : 0
}

export interface EnergyCarrierShare {
  readonly label: string
  readonly kwh: number
  readonly percent: number
}

/**
 * Anteile der eingesetzten Energieträger am Energieeinsatz (kWh) des
 * Heizkreises (§ 6a Abs. 3 HeizKV). `null`, wenn für eine Energiequelle mit
 * Kosten kein Energieeinsatz ermittelbar ist (Menge oder Heizwert fehlt).
 * Ganze Prozent, Restverteilung nach größtem Rest (Summe 100 %).
 */
export function energyCarrierShares(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): EnergyCarrierShare[] | null {
  const byCarrier = new Map<string, number>()
  for (const trace of circuit.energySources) {
    const kwh = energyInputKwh(trace)
    if (kwh <= 0 && trace.fifoConsumptionCostCents > 0) return null
    if (kwh <= 0) continue
    const label = carrierName(appData, trace) ?? sourceLabel(appData, trace)
    byCarrier.set(label, (byCarrier.get(label) ?? 0) + kwh)
  }
  const total = [...byCarrier.values()].reduce((sum, kwh) => sum + kwh, 0)
  if (total <= 0) return null
  const raw = [...byCarrier].map(([label, kwh]) => ({
    label,
    kwh,
    exact: (kwh / total) * 100,
  }))
  const floors = raw.map(({ exact }) => Math.floor(exact))
  let missing = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map(({ exact }, index) => ({ index, rest: exact - Math.floor(exact) }))
    .sort((left, right) => right.rest - left.rest || left.index - right.index)
  for (const { index } of order) {
    if (missing <= 0) break
    floors[index] = floors[index]! + 1
    missing -= 1
  }
  return raw.map(({ label, kwh }, index) => ({
    label,
    kwh,
    percent: floors[index]!,
  }))
}

/**
 * Energieträger mit Anteilen am Energieeinsatz, z. B. „Strom 40 %,
 * Flüssiggas 60 % (Anteil am Energieeinsatz in kWh)“; ohne ermittelbare
 * Anteile nur die Energieträger.
 */
export function energyCarrierMixLabel(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  const shares = energyCarrierShares(appData, circuit)
  if (!shares) return energyCarrierLabel(appData, circuit)
  return `${shares
    .map(({ label, percent }) => `${label} ${formatPercent(percent)}`)
    .join(', ')} (Anteil am Energieeinsatz in kWh)`
}

/** Messart des Heizkreises: Wärmemengenzähler (kWh) oder Ablesung. */
export function captureModeFor(
  calculation: CalculationOutput,
  buildingId: string | null | undefined,
): ConsumptionCaptureMode {
  return calculation.meteringTrace?.circuits.some(
    (circuit) => circuit.buildingId === buildingId,
  )
    ? 'heat_meter'
    : 'manual_reading'
}

export function consumptionUnitLabel(mode: ConsumptionCaptureMode): string {
  return mode === 'heat_meter' ? 'kWh' : 'Einheiten'
}

function quantity(value: number, unit: string | null): string {
  const label = formatQuantityUnit(unit)
  return `${formatNumber(value, 2)}${label ? ` ${label}` : ''}`
}

/**
 * Abrechnung als Rechnungsliste statt Brennstoffkonto: leitungsgebundene
 * Energie ohne Lagerbestand (Strom, Wärmepumpe, Fernwärme, Erdgas) und
 * Rechnungen ohne Mengenangabe.
 */
function isInvoiceBased(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): boolean {
  if (trace.method === 'direct_cost_without_quantity') return true
  const source = energySourceFor(appData, trace)
  return (
    source != null &&
    isGridEnergySource(source) &&
    !trace.lots.some(({ kind }) => kind === 'opening_stock') &&
    trace.requestedRemainingQuantity === 0
  )
}

function lotDescription(
  appData: AppDataFile,
  lot: FuelLotTrace,
): string | null {
  const delivery = appData.billingData.fuelDeliveries.find(
    ({ id }) => id === lot.sourceId,
  )
  return delivery?.description?.trim() || null
}

/** „Rechnung vom 17.02.2026: Jahresabrechnung 2025“ bzw. ohne Datum. */
function invoiceLabel(appData: AppDataFile, lot: FuelLotTrace): string {
  const description = lotDescription(appData, lot)
  const head = lot.date
    ? `Rechnung vom ${formatIsoDate(lot.date)}`
    : 'Rechnung ohne Datum'
  return description ? `${head}: ${description}` : head
}

/** Lieferzeile im Brennstoffkonto; Kosten ohne Liefermenge eigens benannt. */
function deliveryLabel(appData: AppDataFile, lot: FuelLotTrace): string {
  if (lot.quantity === 0 && lot.valueCents !== 0) {
    const description = lotDescription(appData, lot)
    const head = `+ Rechnung vom ${formatIsoDate(lot.date)} ohne Liefermenge`
    return description ? `${head}: ${description}` : head
  }
  // Die Belegbezeichnung zeigt, woher der Zugang stammt (z. B. der vom
  // Voreigentümer übernommene Verbrauch), statt nur „Lieferung“ zu nennen.
  const description = lotDescription(appData, lot)
  if (description?.startsWith('Verbrauch ')) return `+ ${description}`
  const head = `+ Lieferung ${formatIsoDate(lot.date)}`
  return description ? `${head}: ${description}` : head
}

function quantityCell(
  value: number,
  unit: string | null,
  bold?: boolean,
): TableCell {
  return { text: quantity(value, unit), alignment: 'right', noWrap: true, bold }
}

const NO_QUANTITY: TableCell = { text: '–', alignment: 'right' }

/** Rechnungsliste je Energiequelle: Summe der Rechnungen = Energiekosten. */
function invoiceRows(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
  title: TableCell[],
): TableCell[][] {
  const unit = trace.quantityUnit
  const withQuantity = trace.method === 'fifo' && trace.consumedQuantity > 0
  const invoices = trace.lots.filter(({ kind }) => kind === 'delivery')
  return [
    title,
    ...invoices.map((lot): TableCell[] => [
      invoiceLabel(appData, lot),
      lot.quantity > 0 ? quantityCell(lot.quantity, unit) : NO_QUANTITY,
      amountCell(lot.valueCents),
    ]),
    [
      {
        text:
          trace.method === 'direct_cost_without_quantity'
            ? '= Energiekosten laut Rechnungen (ohne Mengenangabe)'
            : '= Energiekosten laut Rechnungen',
        bold: true,
      },
      withQuantity
        ? quantityCell(trace.consumedQuantity, unit, true)
        : NO_QUANTITY,
      amountCell(trace.fifoConsumptionCostCents, { bold: true }),
    ],
  ]
}

/** Brennstoffkonto je Energiequelle: Anfang + Lieferungen − Ende = Verbrauch. */
function fuelAccountRows(
  appData: AppDataFile,
  trace: EnergySourceCalculationTrace,
): TableCell[][] {
  const title: TableCell[] = [
    { text: sourceLabel(appData, trace), bold: true, colSpan: 3 },
    {},
    {},
  ]
  if (isInvoiceBased(appData, trace)) return invoiceRows(appData, trace, title)
  const unit = trace.quantityUnit
  const lots = trace.lots.map((lot): TableCell[] => [
    lot.kind === 'opening_stock'
      ? 'Anfangsbestand'
      : deliveryLabel(appData, lot),
    quantityCell(lot.quantity, unit),
    amountCell(lot.valueCents),
  ])
  return [
    title,
    ...(trace.lots.some(({ kind }) => kind === 'opening_stock')
      ? []
      : [
          [
            'Anfangsbestand',
            quantityCell(0, unit),
            amountCell(0),
          ] as TableCell[],
        ]),
    ...lots,
    [
      '− Endbestand',
      quantityCell(trace.valuedRemainingQuantity, unit),
      amountCell(trace.remainingValueCents),
    ],
    [
      { text: '= Verbrauch (FIFO-Bewertung)', bold: true },
      quantityCell(trace.consumedQuantity, unit, true),
      amountCell(trace.fifoConsumptionCostCents, { bold: true }),
    ],
  ]
}

function fuelTableHeading(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): string {
  const invoiceBased = circuit.energySources.map((trace) =>
    isInvoiceBased(appData, trace),
  )
  if (invoiceBased.every(Boolean)) return 'Energierechnungen'
  if (invoiceBased.some(Boolean))
    return 'Brennstoffkonto bzw. Energierechnungen'
  return 'Brennstoffkonto'
}

export function fuelAccountTable(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
): Content {
  if (circuit.energySources.length === 0) {
    return {
      text: 'Für diesen Heizkreis sind keine Energiequellen erfasst.',
      margin: [0, 2, 0, 4],
    }
  }
  return {
    table: {
      headerRows: 1,
      widths: ['*', 90, 80],
      body: [
        [
          { text: fuelTableHeading(appData, circuit), style: 'th' },
          { text: 'Menge', style: 'th', alignment: 'right' },
          { text: 'Betrag', style: 'th', alignment: 'right' },
        ],
        ...circuit.energySources.flatMap((trace) =>
          fuelAccountRows(appData, trace),
        ),
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

/** Eine „davon“-Zeile der Heizungs-Betriebskosten. */
export interface HeatingOperatingCostLine {
  readonly kind: 'entry' | 'category' | 'non_allocable' | 'rounding'
  readonly date: string | null
  readonly label: string
  readonly amountCents: number
}

function categoryGross(
  category: CostCategory,
  entries: readonly CostEntry[],
): number {
  return entries.length > 0
    ? entries.reduce((sum, entry) => sum + entry.amountCents, 0)
    : (category.totalAmountCents ?? 0)
}

/** Umlagefähiger Anteil wie im Core (`allocableFactor`). */
function categoryAllocableFactor(
  category: CostCategory,
  entries: readonly CostEntry[],
): number {
  const nonZero = entries.filter((entry) => entry.amountCents !== 0)
  const absoluteTotal = nonZero.reduce(
    (sum, entry) => sum + Math.abs(entry.amountCents),
    0,
  )
  if (absoluteTotal > 0)
    return (
      nonZero.reduce(
        (sum, entry) =>
          sum +
          Math.abs(entry.amountCents) * ((entry.allocablePercent ?? 100) / 100),
        0,
      ) / absoluteTotal
    )
  return (category.allocablePercent ?? 100) / 100
}

function roundCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** Heizungs-Kostenarten eines Heizkreises (Zuordnung wie im Core). */
export function heatingOperatingCategories(
  appData: AppDataFile,
  billingPeriodId: string,
  buildingId: string,
): CostCategory[] {
  return appData.billingData.costCategories.filter(
    (category) =>
      category.billingPeriodId === billingPeriodId &&
      category.kind === 'heating' &&
      category.scope?.kind === 'building' &&
      category.scope.buildingId === buildingId,
  )
}

/**
 * Aufschlüsselung der „Betriebskosten der Heizungsanlage“ in Belege bzw.
 * Kostenarten. Die Zuordnung entspricht `heatingOperating` im Core
 * (Kostenarten der Art „Heizung“ mit Gebäude-Bereich des Heizkreises,
 * umlagefähiger Anteil). Die Summe der Zeilen entspricht exakt
 * `reconciliation.plusHeatingOperatingCostsCents`; eine verbleibende
 * Centdifferenz wird als Rundungszeile ausgewiesen.
 */
export function heatingOperatingCostLines(
  appData: AppDataFile,
  billingPeriodId: string,
  circuit: HeatingCircuitTrace,
): HeatingOperatingCostLine[] {
  const lines: HeatingOperatingCostLine[] = []
  for (const category of heatingOperatingCategories(
    appData,
    billingPeriodId,
    circuit.buildingId,
  )) {
    const entries = appData.billingData.costEntries.filter(
      ({ costCategoryId }) => costCategoryId === category.id,
    )
    const label = category.statementText ?? category.label
    const gross = categoryGross(category, entries)
    if (entries.length > 0) {
      for (const entry of entries.filter(({ amountCents }) => amountCents))
        lines.push({
          kind: 'entry',
          date: entry.date ?? null,
          label: entry.description?.trim()
            ? `${label}: ${entry.description.trim()}`
            : label,
          amountCents: entry.amountCents,
        })
    } else if (gross !== 0) {
      lines.push({ kind: 'category', date: null, label, amountCents: gross })
    }
    const nonAllocable =
      roundCents(gross * categoryAllocableFactor(category, entries)) - gross
    if (nonAllocable !== 0)
      lines.push({
        kind: 'non_allocable',
        date: null,
        label: `nicht umlagefähiger Anteil ${label}`,
        amountCents: nonAllocable,
      })
  }
  const printed = lines.reduce((sum, line) => sum + line.amountCents, 0)
  const difference =
    circuit.reconciliation.plusHeatingOperatingCostsCents - printed
  if (difference !== 0)
    lines.push({
      kind: 'rounding',
      date: null,
      label: 'Rundung',
      amountCents: difference,
    })
  return lines
}

/**
 * Schlagworte für Entgelte der Verbrauchserfassung (§ 6a HeizKV). „Abrechnung“
 * zählt nur als Heizkosten-/Verbrauchsabrechnung oder Abrechnungsentgelt –
 * nicht z. B. eine Erwerber- oder Energieabrechnung mit Brennstoffkosten.
 */
const METERING_FEE_PATTERN =
  /w(?:ä|ae)rmez(?:ä|ae)hler|heizkostenverteiler|messdienst|ablesung|(?:heizkosten|w(?:ä|ae)rmekosten|verbrauchs)abrechnung|abrechnungs(?:dienst|entgelt|geb(?:ü|ue)hr|kosten)|eichung|verbrauchserfassung|ger(?:ä|ae)temiete|z(?:ä|ae)hlermiete/iu

/**
 * Summe der erkennbaren Entgelte für Verbrauchserfassung und Abrechnung
 * in den Heizungs-Betriebskosten des Heizkreises; `null`, wenn keine
 * Kostenposition erkennbar ist.
 */
export function meteringFeeCents(
  appData: AppDataFile,
  billingPeriodId: string,
  buildingId: string,
): number | null {
  let found = false
  let total = 0
  for (const category of heatingOperatingCategories(
    appData,
    billingPeriodId,
    buildingId,
  )) {
    const entries = appData.billingData.costEntries.filter(
      ({ costCategoryId }) => costCategoryId === category.id,
    )
    const categoryMatches = METERING_FEE_PATTERN.test(
      `${category.label} ${category.statementText ?? ''}`,
    )
    if (entries.length === 0) {
      if (categoryMatches && category.totalAmountCents) {
        found = true
        total += category.totalAmountCents
      }
      continue
    }
    for (const entry of entries)
      if (
        categoryMatches ||
        METERING_FEE_PATTERN.test(entry.description ?? '')
      ) {
        found = true
        total += entry.amountCents
      }
  }
  return found ? total : null
}

/** Zusammenstellung der Heizkosten des Heizkreises (§ 7 Abs. 2 HeizKV). */
export function heatingCompilationTable(
  circuit: HeatingCircuitTrace,
  operatingLines: readonly HeatingOperatingCostLine[] = [],
): Content {
  const { reconciliation } = circuit
  const rows: TableCell[][] = [
    [
      'Brennstoff-/Energiekosten (Verbrauch)',
      amountCell(reconciliation.fifoConsumptionCostCents),
    ],
    [
      '− darin enthaltene CO2-Kosten (gesondert verteilt)',
      amountCell(reconciliation.minusCo2Cents),
    ],
  ]
  if (circuit.warmWater.method !== 'none') {
    rows.push([
      `− Kosten der Warmwasserbereitung (${formatPercent(circuit.warmWater.sharePercent)})`,
      amountCell(reconciliation.minusHotWaterCents),
    ])
  }
  rows.push(
    [
      '+ Betriebsstrom der Heizungsanlage',
      amountCell(reconciliation.plusOperatingElectricityCents),
    ],
    [
      '+ Betriebskosten der Heizungsanlage (Wartung, Messdienst u. a.)',
      amountCell(reconciliation.plusHeatingOperatingCostsCents),
    ],
    ...operatingLines.map((line): TableCell[] => [
      {
        text: `davon ${line.date ? `${formatIsoDate(line.date)} ` : ''}${line.label}`,
        fontSize: 7.5,
        color: MUTED,
        margin: [10, 0, 0, 0],
      },
      {
        text: formatEuroCents(line.amountCents),
        alignment: 'right',
        noWrap: true,
        fontSize: 7.5,
        color: MUTED,
      },
    ]),
  )
  if (reconciliation.roundingDifferenceCents !== 0) {
    rows.push([
      '± Rundungsdifferenz',
      amountCell(reconciliation.roundingDifferenceCents),
    ])
  }
  rows.push([
    { text: '= Heizkosten des Heizkreises', bold: true },
    amountCell(reconciliation.heatingPoolCents, { bold: true }),
  ])
  return {
    table: { widths: ['*', 80], body: rows },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

/** Gesamt-Aufteilung in Grund- und Verbrauchskosten mit Nennern. */
export function heatingSplitTotalsTable(
  circuit: HeatingCircuitTrace,
  mode: ConsumptionCaptureMode,
): Content {
  const { split } = circuit
  const unit = consumptionUnitLabel(mode)
  const basePrice =
    split.baseDenominator > 0 ? split.baseCents / split.baseDenominator : 0
  const consumptionPrice =
    split.consumptionDenominator > 0
      ? split.consumptionCents / split.consumptionDenominator
      : 0
  return {
    table: {
      widths: ['*', 80],
      // § 9a Abs. 2 HeizKV: Die gesamten Heizkosten werden nach Fläche
      // verteilt – keine „auf 100 % erhöhten Grundkosten“.
      body: split.areaOnlySection9a
        ? [
            [
              `Verteilung nach § 9a Abs. 2 HeizKV: 100 % nach Fläche: ${formatEuroCents(split.baseCents)} : ${formatNumber(split.baseDenominator)} m² ${baseAreaLabel(split.baseAreaBasis)} = ${formatUnitPrice(basePrice, 'm²')}`,
              amountCell(split.baseCents),
            ],
            ['Verbrauchsabhängiger Anteil: entfällt', amountCell(0)],
          ]
        : [
            [
              `Grundkosten ${formatPercent(split.baseSharePercent)}: ${formatEuroCents(split.baseCents)} : ${formatNumber(split.baseDenominator)} m² ${baseAreaLabel(split.baseAreaBasis)} = ${formatUnitPrice(basePrice, 'm²')}`,
              amountCell(split.baseCents),
            ],
            [
              `Verbrauchskosten ${formatPercent(split.consumptionSharePercent)}: ${formatEuroCents(split.consumptionCents)} : ${formatNumber(split.consumptionDenominator)} ${unit} = ${formatUnitPrice(consumptionPrice, unit === 'kWh' ? 'kWh' : 'Einheit')}`,
              amountCell(split.consumptionCents),
            ],
          ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 4],
  }
}

function co2EmissionsKg(circuit: HeatingCircuitTrace): number {
  return circuit.energySources.reduce((sum, source) => sum + source.co2Kg, 0)
}

/** Keine CO2-Kosten nach BEHG (z. B. Wärmepumpe, Biomasse). */
export function hasNoBehgCo2Costs(circuit: HeatingCircuitTrace): boolean {
  return circuit.co2.totalCents === 0 && co2EmissionsKg(circuit) === 0
}

/**
 * Vollständige CO2-Tabelle nach § 7 Abs. 3 CO2KostAufG. Mit `tenantCents`
 * wird zusätzlich der Anteil des Mieters ausgewiesen.
 */
export function co2Table(
  appData: AppDataFile,
  circuit: HeatingCircuitTrace,
  tenantCents?: number,
): Content[] {
  const heading: Content = {
    text: `${CO2_COST_ALLOCATION_HEADING} – ${circuitTitle(appData, circuit)}`,
    style: 'th',
    margin: [0, 8, 0, 4],
  }
  if (hasNoBehgCo2Costs(circuit)) {
    return [
      heading,
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            ['Energieträger', energyCarrierLabel(appData, circuit)],
            [{ text: NO_BEHG_CO2_COSTS, colSpan: 2 }, {}],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
    ]
  }
  const { co2, split } = circuit
  const value = (text: string): TableCell => ({
    text,
    alignment: 'right',
    noWrap: true,
  })
  const rows: TableCell[][] = [
    ['Energieträger', value(energyCarrierLabel(appData, circuit))],
    [
      'CO2-Emissionen im Abrechnungszeitraum',
      value(`${formatNumber(co2EmissionsKg(circuit), 1)} kg`),
    ],
    [
      'CO2-Preis',
      value(
        co2.pricePerTonCents == null
          ? 'manuell festgelegt'
          : `${formatEuroCents(co2.pricePerTonCents)} je t`,
      ),
    ],
    ['CO2-Kosten gesamt', amountCell(co2.totalCents)],
    [
      'Beheizte Wohnfläche des Gebäudes',
      value(`${formatNumber(co2.heatedAreaSqm)} m²`),
    ],
    [
      'Kohlendioxidausstoß je m² Wohnfläche und Jahr',
      value(`${formatNumber(co2.intensityKgPerSqmYear, 1)} kg CO2/m²·a`),
    ],
    [
      'Einstufung (Stufenmodell § 5 CO2KostAufG)',
      value(co2.tier === 'manual' ? 'manuell' : `Stufe ${co2.tier}`),
    ],
    [
      'Anteil Mieter / Vermieter',
      value(
        `${formatPercent(co2.tenantPercent)} / ${formatPercent(co2.landlordPercent)}`,
      ),
    ],
    ['Mieteranteil (auf Nutzer verteilt)', amountCell(co2.tenantCents)],
    ['Vermieteranteil (nicht umgelegt)', amountCell(co2.landlordCents)],
  ]
  if (tenantCents !== undefined) {
    rows.push([
      { text: 'Ihr Anteil an den CO2-Kosten', bold: true },
      amountCell(tenantCents, { bold: true }),
    ])
  }
  return [
    heading,
    {
      table: { widths: ['*', 'auto'], body: rows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    {
      // Bei 0 € Vermieteranteil (Stufe 1) wäre der Abzugssatz irreführend.
      text: `${co2.landlordCents !== 0 ? `${co2LandlordDeductedSentence(formatEuroCents(co2.landlordCents))} ` : ''}${co2DistributionSentence(split.baseSharePercent, split.consumptionSharePercent, split.baseAreaBasis)}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 8],
    },
  ]
}
