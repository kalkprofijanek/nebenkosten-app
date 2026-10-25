/**
 * Entgelt für die Erstellung der Heiz-/Warmwasserkostenabrechnung durch einen
 * Abrechnungsdienstleister (§ 7 Abs. 2, § 8 Abs. 2 HeizKV „Kosten der
 * Verwendung einer Ausstattung zur Verbrauchserfassung einschließlich der
 * Kosten der Berechnung und Aufteilung“; ADR-0015).
 *
 * Das Entgelt ist eine Heizungs-Betriebskostenart des Heizkreises
 * (`kind: 'heating'`, Geltungsbereich Gebäude). Es fließt damit in den
 * Heiztopf und wird nach dessen Regeln (Grund-/Verbrauchskosten, bei
 * zentralem Warmwasser anteilig nach § 9 Abs. 1 HeizKV) verteilt – keine
 * Pauschale je Mieter; auf Leerstand entfallende Anteile trägt der
 * Vermieter. Energie und CO₂ bleiben unberührt.
 *
 * Dieses Modul rechnet nicht selbst um, sondern liefert
 * - die Kalkulationshilfe (Netto je Heizkostenabrechnung × erstellte
 *   Abrechnungen, Umsatzsteuer),
 * - die Zahl der erstellten Heizkostenabrechnungen einer Abrechnungseinheit:
 *   je bewohnte Nutzung eine; ein Nutzerwechsel ergibt zwei Abrechnungen,
 *   Leerstand keine,
 * - eine Vorschau mit der Auswirkung je Nutzung (Vergleichsrechnung mit und
 *   ohne die Abrechnungsdienstleistung).
 */
import type {
  AppDataFile,
  CostCategory,
  MeteringFeeKind,
} from '@nebenkosten/schema'
import { calculateBilling } from '../calculation/calculate-billing'
import { createCalculationInput } from '../input/create-calculation-input'
import { roundCentsHalfAwayFromZero } from '../rounding'

/** Vertragspreis des Abrechnungsdienstleisters. */
export interface BillingServiceFeeTariff {
  /** Netto je erstellter Heizkostenabrechnung in Cent. */
  readonly netPerStatementCents: number
  /** Umsatzsteuersatz in Prozent (z. B. 19). */
  readonly vatRatePercent: number
}

export interface BillingServiceFeeQuote {
  statementCount: number
  netPerStatementCents: number
  vatRatePercent: number
  netCents: number
  vatCents: number
  grossCents: number
}

/**
 * Kalkulationshilfe: Netto = Abrechnungen × Netto je Abrechnung,
 * Umsatzsteuer auf die Nettosumme (kaufmännisch gerundet),
 * Brutto = Netto + Umsatzsteuer.
 */
export function billingServiceFeeQuote(
  statementCount: number,
  tariff: Readonly<BillingServiceFeeTariff>,
): BillingServiceFeeQuote {
  if (!Number.isSafeInteger(statementCount) || statementCount < 0)
    throw new Error(
      'Die Zahl der Heizkostenabrechnungen muss eine ganze Zahl ≥ 0 sein.',
    )
  if (
    !Number.isSafeInteger(tariff.netPerStatementCents) ||
    tariff.netPerStatementCents < 0
  )
    throw new Error(
      'Der Nettopreis je Heizkostenabrechnung muss ein Centbetrag ≥ 0 sein.',
    )
  if (
    !Number.isFinite(tariff.vatRatePercent) ||
    tariff.vatRatePercent < 0 ||
    tariff.vatRatePercent > 100
  )
    throw new Error('Der Umsatzsteuersatz muss zwischen 0 und 100 liegen.')
  const netCents = statementCount * tariff.netPerStatementCents
  const vatCents = roundCentsHalfAwayFromZero(
    (netCents * tariff.vatRatePercent) / 100,
  )
  return {
    statementCount,
    netPerStatementCents: tariff.netPerStatementCents,
    vatRatePercent: tariff.vatRatePercent,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
  }
}

/**
 * Schlagworte für die Erstellung der Heiz-/Warmwasserkostenabrechnung, wenn
 * die Art des Entgelts nicht angegeben ist. Erwerber- oder
 * Energieabrechnungen zählen nicht.
 */
export const BILLING_SERVICE_PATTERN =
  /(?:heiz|w(?:ä|ae)rme|warmwasser)\S*kostenabrechnung|verbrauchsabrechnung|abrechnungs(?:dienst|entgelt|geb(?:ü|ue)hr)|erfassung und abrechnung|erstellung der (?:heiz|w(?:ä|ae)rme|warmwasser)/iu

/**
 * Abrechnungsdienstleistung: Heizungs-Betriebskostenart mit Art
 * `billing_service`; ohne Art über Schlagworte, sofern sie nicht
 * ausdrücklich als „kein Entgelt“ gekennzeichnet ist.
 */
export function isBillingServiceCategory(
  category: Readonly<CostCategory>,
): boolean {
  if (category.kind !== 'heating') return false
  if (category.meteringFeeKind != null)
    return category.meteringFeeKind === 'billing_service'
  if (category.meteringFee === false) return false
  return BILLING_SERVICE_PATTERN.test(
    `${category.label} ${category.statementText ?? ''}`,
  )
}

function occupancyBuildingId(
  data: Readonly<AppDataFile>,
  occupancy: AppDataFile['billingData']['occupancyPeriods'][number],
): string | null {
  if (occupancy.costScope?.kind === 'building')
    return occupancy.costScope.buildingId
  return (
    data.masterData.units.find(({ id }) => id === occupancy.unitId)
      ?.buildingId ?? null
  )
}

/**
 * Erstellte Heizkostenabrechnungen der Abrechnungseinheit im
 * Abrechnungsjahr: je bewohnte Nutzung (`kind: 'tenant'`) eine, als
 * Nutzungs-IDs in Erfassungsreihenfolge. Ein Nutzerwechsel ergibt zwei
 * Abrechnungen, Leerstand keine (ADR-0015).
 */
export function billingServiceStatementIds(
  data: Readonly<AppDataFile>,
  billingPeriodId: string,
  buildingId: string,
): string[] {
  return data.billingData.occupancyPeriods
    .filter(
      (occupancy) =>
        occupancy.billingPeriodId === billingPeriodId &&
        occupancy.kind === 'tenant' &&
        occupancyBuildingId(data, occupancy) === buildingId,
    )
    .map(({ id }) => id)
}

export interface BillingServiceFeeEntry {
  id: string
  costCategoryId: string
  description: string | null
  receiptReference: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  netCents: number | null
  vatCents: number | null
  vatRatePercent: number | null
  grossCents: number
}

export interface BillingServiceFeeBuilding {
  buildingId: string
  buildingName: string | null
  /** Erstellte Heizkostenabrechnungen (bewohnte Nutzungen, ohne Leerstand). */
  statementCount: number
  /** Kalkulationshilfe; `null` ohne Tarif. */
  quote: BillingServiceFeeQuote | null
  /** Erfasste Abrechnungsdienstleistung (Summe der Belege) in Cent. */
  recordedCents: number
  /** Erfasst − Kalkulationshilfe; `null` ohne Tarif. */
  differenceCents: number | null
  /** Mehr als eine Kostenart der Abrechnungsdienstleistung (Doppelansatz?). */
  duplicate: boolean
  categories: Array<{ id: string; label: string; amountCents: number }>
  entries: BillingServiceFeeEntry[]
  /** Übrige Entgelte (Gerätemiete, Ablesung, Eichung …), getrennt geführt. */
  otherMeteringFees: Array<{
    id: string
    kind: MeteringFeeKind
    amountCents: number
  }>
  /** Aufteilung der erfassten Abrechnungsdienstleistung im Heiztopf. */
  allocation: { heatingCents: number; hotWaterCents: number }
}

export interface BillingServiceFeeOccupancyImpact {
  occupancyId: string
  unitId: string
  buildingId: string | null
  isVacancy: boolean
  deltaCents: number
}

export interface BillingServiceFeePreview {
  billingPeriodId: string
  tariff: BillingServiceFeeTariff | null
  buildings: BillingServiceFeeBuilding[]
  totals: {
    statementCount: number
    quoteGrossCents: number | null
    recordedCents: number
    differenceCents: number | null
  }
  impact: {
    occupancies: BillingServiceFeeOccupancyImpact[]
    /** Summe der Mehrbelastung der Mieter (ohne Leerstand). */
    tenantDeltaCents: number
    /** Mehrbelastung des Vermieters (Leerstand, nicht umlagefähig). */
    landlordDeltaCents: number
    /** CO₂-Kosten und -Aufteilung je Heizkreis unverändert. */
    co2Unchanged: boolean
    /** Energiemenge je Heizkreis unverändert. */
    energyUnchanged: boolean
  }
}

function categoryAmountCents(
  data: Readonly<AppDataFile>,
  category: Readonly<CostCategory>,
): number {
  const entries = data.billingData.costEntries.filter(
    ({ costCategoryId }) => costCategoryId === category.id,
  )
  return entries.length > 0
    ? entries.reduce((sum, { amountCents }) => sum + amountCents, 0)
    : (category.totalAmountCents ?? 0)
}

/** Datenstand ohne die Abrechnungsdienstleistung (Vergleichsrechnung). */
function withoutBillingService(
  data: Readonly<AppDataFile>,
  categoryIds: ReadonlySet<string>,
): AppDataFile {
  return {
    ...data,
    billingData: {
      ...data.billingData,
      costCategories: data.billingData.costCategories.filter(
        ({ id }) => !categoryIds.has(id),
      ),
      costEntries: data.billingData.costEntries.filter(
        ({ costCategoryId }) => !categoryIds.has(costCategoryId),
      ),
    },
  }
}

/**
 * Vorschau je Abrechnungseinheit (Heizkreis/Gebäude): Abrechnungen,
 * Kalkulationshilfe, erfasste Rechnung, Doppelansätze und Auswirkung je
 * Nutzung. Wirft, wenn das Abrechnungsjahr fehlt.
 */
export function billingServiceFeePreview(
  data: Readonly<AppDataFile>,
  billingPeriodId: string,
  options: { readonly tariff?: BillingServiceFeeTariff } = {},
): BillingServiceFeePreview {
  if (!data.billingData.billingPeriods.some(({ id }) => id === billingPeriodId))
    throw new Error(`Abrechnungsperiode "${billingPeriodId}" nicht gefunden`)
  const tariff = options.tariff ?? null
  const circuits = data.billingData.heatingCircuits.filter(
    (circuit) => circuit.billingPeriodId === billingPeriodId,
  )
  const heatingCategories = data.billingData.costCategories.filter(
    (category) =>
      category.billingPeriodId === billingPeriodId &&
      category.kind === 'heating' &&
      category.scope?.kind === 'building',
  )
  const serviceIds = new Set(
    heatingCategories
      .filter((category) => isBillingServiceCategory(category))
      .map(({ id }) => id),
  )

  const withFee = calculateBilling(
    createCalculationInput(data as AppDataFile, billingPeriodId),
  )
  const withoutFee = calculateBilling(
    createCalculationInput(
      withoutBillingService(data, serviceIds),
      billingPeriodId,
    ),
  )
  const circuitAfter = new Map(
    withFee.heating.perCircuit.map((circuit) => [circuit.buildingId, circuit]),
  )
  const circuitBefore = new Map(
    withoutFee.heating.perCircuit.map((circuit) => [
      circuit.buildingId,
      circuit,
    ]),
  )

  const buildings = circuits.map((circuit): BillingServiceFeeBuilding => {
    const { buildingId } = circuit
    const inBuilding = heatingCategories.filter(
      ({ scope }) =>
        scope?.kind === 'building' && scope.buildingId === buildingId,
    )
    const service = inBuilding.filter(({ id }) => serviceIds.has(id))
    const categories = service.map((category) => ({
      id: category.id,
      label: category.label,
      amountCents: categoryAmountCents(data, category),
    }))
    const recordedCents = categories.reduce(
      (sum, { amountCents }) => sum + amountCents,
      0,
    )
    const entries = data.billingData.costEntries
      .filter(({ costCategoryId }) => serviceIds.has(costCategoryId))
      .filter(({ costCategoryId }) =>
        service.some(({ id }) => id === costCategoryId),
      )
      .map((entry): BillingServiceFeeEntry => ({
        id: entry.id,
        costCategoryId: entry.costCategoryId,
        description: entry.description ?? null,
        receiptReference: entry.receiptReference ?? null,
        invoiceNumber: entry.invoice?.invoiceNumber ?? null,
        invoiceDate: entry.invoice?.invoiceDate ?? null,
        servicePeriodStart: entry.invoice?.servicePeriodStart ?? null,
        servicePeriodEnd: entry.invoice?.servicePeriodEnd ?? null,
        netCents: entry.invoice?.netCents ?? null,
        vatCents: entry.invoice?.vatCents ?? null,
        vatRatePercent: entry.invoice?.vatRatePercent ?? null,
        grossCents: entry.amountCents,
      }))
    const statementCount = billingServiceStatementIds(
      data,
      billingPeriodId,
      buildingId,
    ).length
    const quote = tariff ? billingServiceFeeQuote(statementCount, tariff) : null
    const after = circuitAfter.get(buildingId)
    const before = circuitBefore.get(buildingId)
    const hotWaterCents =
      (after?.hotWaterCents ?? 0) - (before?.hotWaterCents ?? 0)
    return {
      buildingId,
      buildingName:
        data.masterData.buildings.find(({ id }) => id === buildingId)?.name ??
        null,
      statementCount,
      quote,
      recordedCents,
      differenceCents: quote ? recordedCents - quote.grossCents : null,
      duplicate: service.length > 1,
      categories,
      entries,
      otherMeteringFees: inBuilding
        .filter(
          ({ id, meteringFeeKind }) =>
            !serviceIds.has(id) &&
            meteringFeeKind != null &&
            meteringFeeKind !== 'billing_service',
        )
        .map((category) => ({
          id: category.id,
          kind: category.meteringFeeKind as MeteringFeeKind,
          amountCents: categoryAmountCents(data, category),
        })),
      allocation: {
        heatingCents: recordedCents - hotWaterCents,
        hotWaterCents,
      },
    }
  })

  const before = new Map(withoutFee.tenants.map((t) => [t.id, t.shareCents]))
  const occupanciesById = new Map(
    data.billingData.occupancyPeriods.map((o) => [o.id, o]),
  )
  const occupancies = withFee.tenants.map((tenant) => {
    const occupancy = occupanciesById.get(tenant.id)
    return {
      occupancyId: tenant.id,
      unitId: occupancy?.unitId ?? '',
      buildingId: occupancy ? occupancyBuildingId(data, occupancy) : null,
      isVacancy: tenant.isVacancy,
      deltaCents: tenant.shareCents - (before.get(tenant.id) ?? 0),
    }
  })
  const co2Key = (result: typeof withFee) =>
    JSON.stringify(
      result.heating.perCircuit.map((c) => [
        c.buildingId,
        c.co2CostCents,
        c.co2TenantCents,
        c.co2LandlordCents,
        c.co2TenantPercent,
        c.co2Kg,
      ]),
    )
  const energyKey = (result: typeof withFee) =>
    JSON.stringify(
      result.heating.perCircuit.map((c) => [c.buildingId, c.energyKwh]),
    )
  const statementCount = buildings.reduce((sum, b) => sum + b.statementCount, 0)
  const recordedCents = buildings.reduce((sum, b) => sum + b.recordedCents, 0)
  const quoteGrossCents = tariff
    ? buildings.reduce((sum, b) => sum + (b.quote?.grossCents ?? 0), 0)
    : null
  return {
    billingPeriodId,
    tariff,
    buildings,
    totals: {
      statementCount,
      quoteGrossCents,
      recordedCents,
      differenceCents:
        quoteGrossCents === null ? null : recordedCents - quoteGrossCents,
    },
    impact: {
      occupancies,
      tenantDeltaCents: occupancies
        .filter(({ isVacancy }) => !isVacancy)
        .reduce((sum, { deltaCents }) => sum + deltaCents, 0),
      landlordDeltaCents:
        withFee.totals.landlordTotalCents -
        withoutFee.totals.landlordTotalCents,
      co2Unchanged: co2Key(withFee) === co2Key(withoutFee),
      energyUnchanged: energyKey(withFee) === energyKey(withoutFee),
    },
  }
}
