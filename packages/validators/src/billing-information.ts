/**
 * Prüfungen der Abrechnungsangaben, die Mieter in der Einzelabrechnung
 * nachvollziehen können müssen: § 6a HeizKV (Vergleichswerte, Anteile der
 * Energieträger), Energierechnungen leitungsgebundener Energie und eindeutig
 * bezeichnete Belege.
 */
import {
  checkClimateFactor,
  compareTenantWithConsumptionBenchmark,
  isGridEnergySource,
  meteringFeeCents,
  previousPeriodClimateFactor,
  previousPeriodConsumption,
  previousPeriodWeatherFactors,
} from '@nebenkosten/core'
import type {
  CalculationOutput,
  ConsumptionBenchmarkUnavailableReason,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  EnergySource,
  FuelDelivery,
  ValidationIssue,
} from '@nebenkosten/schema'
import { blank, periodCategories } from './helpers'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

function formatEuro(cents: number): string {
  return `${(cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function hasQuantity(delivery: FuelDelivery): boolean {
  return (delivery.quantity?.value ?? 0) > 0
}

function stocksFor(data: AppDataFile, period: BillingPeriod, sourceId: string) {
  return data.billingData.fuelStocks.filter(
    ({ energySourceId, billingPeriodId }) =>
      energySourceId === sourceId && billingPeriodId === period.id,
  )
}

/** Leitungsgebundene Energie ohne Lagerbestand im Abrechnungsjahr. */
function isGridWithoutStock(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
): boolean {
  return (
    isGridEnergySource(source) &&
    stocksFor(data, period, source.id).every(
      (stock) =>
        (stock.openingQuantity?.value ?? 0) <= 0 &&
        (stock.openingValueCents ?? 0) === 0 &&
        (stock.remainingQuantity?.value ?? 0) <= 0,
    )
  )
}

function energyInvoices(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
  deliveries: readonly FuelDelivery[],
  add: Add,
): void {
  const grid = isGridWithoutStock(data, period, source)
  for (const delivery of deliveries) {
    if (!delivery.amountCents) continue
    const entity = { type: 'FuelDelivery', id: delivery.id }
    const invoice = delivery.date
      ? `Rechnung vom ${formatDate(delivery.date)} über ${formatEuro(delivery.amountCents)}`
      : `Rechnung ohne Datum über ${formatEuro(delivery.amountCents)}`
    if (grid && !hasQuantity(delivery))
      add(
        issue(
          'warning',
          'heating.energy_invoice_quantity_missing',
          'heating',
          'Energierechnung ohne Mengenangabe (kWh)',
          {
            entity,
            detail: `${invoice}: Bitte die abgerechnete Menge in kWh und den Liefer-/Verbrauchszeitraum aus der Rechnung ergänzen. Ohne Menge lassen sich die Anteile der Energieträger (§ 6a HeizKV) nicht angeben.`,
          },
        ),
      )
    const outsidePeriod =
      !delivery.date ||
      delivery.date < period.periodStart ||
      delivery.date > period.periodEnd
    if (grid && outsidePeriod && blank(delivery.description))
      add(
        issue(
          'warning',
          'heating.energy_invoice_period_missing',
          'heating',
          'Verbrauchszeitraum der Energierechnung fehlt',
          {
            entity,
            detail: `${invoice} liegt außerhalb des Abrechnungszeitraums. Bitte in der Beschreibung angeben, welchen Liefer- bzw. Verbrauchszeitraum die Rechnung abrechnet (z. B. „Jahresabrechnung Verbrauchszeitraum 01.01.–31.12.${period.year}“).`,
          },
        ),
      )
    if (!grid && !hasQuantity(delivery) && blank(delivery.description))
      add(
        issue(
          'warning',
          'heating.cost_only_delivery_unlabelled',
          'heating',
          'Rechnung ohne Liefermenge ist nicht bezeichnet',
          {
            entity,
            detail: `${invoice}: Bitte in der Beschreibung angeben, wofür der Betrag anfällt (z. B. Fracht oder Mindermengenzuschlag laut Rechnung), damit die Position in der Abrechnung nicht als Lieferung ohne Menge erscheint.`,
          },
        ),
      )
  }
}

/** Energieeinsatz in kWh ist nur mit Menge und (außer bei kWh) Heizwert ermittelbar. */
function energyInputKnown(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
  deliveries: readonly FuelDelivery[],
): boolean {
  const stocks = stocksFor(data, period, source.id)
  const quantities = [
    ...deliveries.flatMap(({ quantity }) =>
      quantity && quantity.value > 0 ? [quantity] : [],
    ),
    ...stocks.flatMap(({ openingQuantity }) =>
      openingQuantity && openingQuantity.value > 0 ? [openingQuantity] : [],
    ),
  ]
  const hasCost =
    deliveries.some(({ amountCents }) => (amountCents ?? 0) > 0) ||
    stocks.some(({ openingValueCents }) => (openingValueCents ?? 0) > 0)
  if (!hasCost) return true
  if (quantities.length === 0) return false
  return (
    quantities.every(({ unit }) => unit === 'kWh') ||
    (source.calorificValueKwhPerUnit ?? 0) > 0
  )
}

export function heatingInformation(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  if (circuits.length === 0) return
  climateFactorInformation(data, period, add)
  previousPeriodWeatherAdjustment(data, period, add)
  for (const circuit of circuits) {
    const benchmark = circuit.consumptionBenchmark
    if (!benchmark)
      add(
        issue(
          'warning',
          'heating.consumption_benchmark_missing',
          'heating',
          '§ 6a HeizKV: Vergleich mit normiertem Durchschnittsnutzer fehlt',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail:
              'Für diesen Heizkreis sind keine Vergleichswerte (z. B. Heizspiegel) erfasst. Die Einzelabrechnungen enthalten dann keinen Vergleich mit einem normierten oder durch Vergleichstests ermittelten Durchschnittsnutzer derselben Nutzerkategorie (§ 6a Abs. 3 Nr. 4 HeizKV). Der mittlere Verbrauch des eigenen Heizkreises ersetzt diesen Vergleich nicht. Bei unvollständigen Angaben nach § 6a HeizKV kann der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 12 Abs. 1 HeizKV).',
          },
        ),
      )
    if (benchmark && benchmark.referenceYear !== period.year)
      add(
        issue(
          'info',
          'heating.consumption_benchmark_year_mismatch',
          'heating',
          'Vergleichswerte aus einem anderen Abrechnungsjahr',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail: `Die Vergleichswerte (${benchmark.source}) beziehen sich auf ${benchmark.referenceYear}, abgerechnet wird ${period.year}. Sind Werte für ${period.year} noch nicht veröffentlicht, ist die jüngste Ausgabe zu verwenden und das Bezugsjahr anzugeben.`,
          },
        ),
      )
    if (meteringFeeCents(data, period.id, circuit.buildingId) === null)
      add(
        issue(
          'warning',
          'heating.metering_fee_not_identified',
          'heating',
          'Entgelte für Verbrauchserfassung nicht erkennbar',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail:
              'Unter den Heizungs-Betriebskosten des Gebäudes ist keine Kostenart als Entgelt für Verbrauchserfassung und Abrechnung (Gerätemiete, Ablesung, Abrechnung, Eichung) gekennzeichnet oder erkennbar. Die Einzelabrechnung nennt dann keinen Betrag (§ 6a Abs. 3 Nr. 1c HeizKV). Kostenart als Messdienstentgelt kennzeichnen; fallen keine Entgelte an, diesen Hinweis bestätigen.',
          },
        ),
      )
    const sources = data.billingData.energySources.filter(
      ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
    )
    const unknownShare: string[] = []
    for (const source of sources) {
      const deliveries = data.billingData.fuelDeliveries.filter(
        ({ energySourceId, billingPeriodId }) =>
          energySourceId === source.id && billingPeriodId === period.id,
      )
      energyInvoices(data, period, source, deliveries, add)
      if (!energyInputKnown(data, period, source, deliveries))
        unknownShare.push(source.name ?? source.sourceType ?? source.key)
    }
    if (sources.length > 1 && unknownShare.length > 0)
      add(
        issue(
          'warning',
          'heating.energy_share_not_determinable',
          'heating',
          'Anteile der Energieträger nicht ermittelbar',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail: `Für ${unknownShare.join(', ')} fehlt die Menge oder der Heizwert. Die Einzelabrechnung nennt dann nur die Energieträger ohne ihre Anteile am Energieeinsatz (§ 6a Abs. 3 HeizKV).`,
          },
        ),
      )
  }
}

/**
 * Witterungsbereinigung des Vorperiodenvergleichs (§ 6a Abs. 3 Satz 3/4
 * HeizKV, ADR-0005): Ein erfasster Klimafaktor muss zum Abrechnungszeitraum
 * und zur Postleitzahl des Objekts passen, und das Vorjahr braucht ebenfalls
 * einen Faktor.
 */
function climateFactorInformation(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const climate = period.climateFactor
  if (!climate) return
  const entity = { type: 'BillingPeriod', id: period.id }
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const check = checkClimateFactor(period, property)
  if (check.status === 'period_mismatch')
    add(
      issue(
        'warning',
        'heating.climate_factor_period_mismatch',
        'heating',
        'Klimafaktor gilt für einen anderen Zeitraum',
        {
          entity,
          detail: `Der Klimafaktor gilt vom ${formatDate(climate.periodStart)} bis ${formatDate(climate.periodEnd)}, abgerechnet wird vom ${formatDate(period.periodStart)} bis ${formatDate(period.periodEnd)}. Den Faktor aus der DWD-Liste mit genau diesem Zeitraum übernehmen.`,
        },
      ),
    )
  if (check.status === 'postal_code_mismatch')
    add(
      issue(
        'warning',
        'heating.climate_factor_postal_code_mismatch',
        'heating',
        'Klimafaktor für eine andere Postleitzahl',
        {
          entity,
          detail: `Der Klimafaktor gilt für die Postleitzahl ${climate.postalCode}, das Objekt liegt in ${check.expectedPostalCode}.`,
        },
      ),
    )
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  const previousInSystem =
    previousPeriod !== undefined &&
    data.billingData.occupancyPeriods.some(
      ({ billingPeriodId }) => billingPeriodId === previousPeriod.id,
    )
  // Ohne Vorjahr im System zählen nur Nutzungen mit übernommenem
  // Vorjahresverbrauch; nur für sie gibt es einen Vorjahresvergleich.
  const missing = previousInSystem
    ? !previousPeriod.climateFactor
    : data.billingData.occupancyPeriods.some(
        (occupancy) =>
          occupancy.billingPeriodId === period.id &&
          occupancy.previousConsumption?.year === period.year - 1 &&
          previousPeriodClimateFactor(data, period, occupancy) === null,
      )
  if (missing)
    add(
      issue(
        'warning',
        'heating.climate_factor_previous_missing',
        'heating',
        'Klimafaktor des Vorjahres fehlt',
        {
          entity: previousInSystem
            ? { type: 'BillingPeriod', id: previousPeriod.id }
            : entity,
          detail: previousInSystem
            ? `Für ${period.year - 1} ist kein Klimafaktor erfasst. Ohne ihn kann der Vorjahresvergleich nicht witterungsbereinigt werden (§ 6a Abs. 3 HeizKV).`
            : `Beim übernommenen Vorjahresverbrauch ${period.year - 1} fehlt der Klimafaktor. Ohne ihn kann der Vorjahresvergleich nicht witterungsbereinigt werden (§ 6a Abs. 3 HeizKV).`,
        },
      ),
    )
}

/**
 * § 6a Abs. 3 Satz 3/4 HeizKV: Die Einzelabrechnung gibt einen
 * Vorjahresvergleich aus, kann ihn aber nicht witterungsbereinigen (eine
 * Warnung je Abrechnungsjahr mit Zahl der betroffenen Nutzungen).
 */
function previousPeriodWeatherAdjustment(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const heatedBuildings = new Set(
    data.billingData.heatingCircuits
      .filter(({ billingPeriodId }) => billingPeriodId === period.id)
      .map(({ buildingId }) => buildingId),
  )
  const unitBuilding = new Map(
    data.masterData.units.map(({ id, buildingId }) => [id, buildingId]),
  )
  const affected = data.billingData.occupancyPeriods.filter((occupancy) => {
    if (occupancy.billingPeriodId !== period.id || occupancy.kind !== 'tenant')
      return false
    const buildingId =
      occupancy.costScope?.kind === 'building'
        ? occupancy.costScope.buildingId
        : unitBuilding.get(occupancy.unitId)
    return (
      buildingId != null &&
      heatedBuildings.has(buildingId) &&
      previousPeriodConsumption(data, period, occupancy).kind === 'available' &&
      previousPeriodWeatherFactors(data, period, occupancy) === null
    )
  })
  if (affected.length === 0) return
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const reason =
    checkClimateFactor(period, property).status === 'matching'
      ? `Für das Vorjahr ${period.year - 1} fehlt der Klimafaktor.`
      : `Für ${period.year} ist kein passender Klimafaktor des Deutschen Wetterdienstes erfasst (Zeitraum und Postleitzahl des Objekts).`
  add(
    issue(
      'warning',
      'heating.previous_period_not_weather_adjusted',
      'heating',
      'Vorjahresvergleich ohne Witterungsbereinigung',
      {
        entity: { type: 'BillingPeriod', id: period.id },
        detail: `${affected.length === 1 ? 'Eine Einzelabrechnung enthält' : `${affected.length} Einzelabrechnungen enthalten`} einen Vergleich mit dem Vorjahr, der nicht witterungsbereinigt werden kann: ${reason} § 6a Abs. 3 Satz 3 HeizKV verlangt einen witterungsbereinigten Vergleich; bei unvollständigen Angaben kann der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 12 Abs. 1 HeizKV).`,
      },
    ),
  )
}

const BENCHMARK_REASON_TEXT: Record<
  Exclude<
    ConsumptionBenchmarkUnavailableReason,
    'no_benchmark' | 'vacancy' | 'not_in_calculation'
  >,
  string
> = {
  energy_input_unknown:
    'Der Energieeinsatz des Heizkreises in kWh ist nicht bekannt (Menge oder Heizwert der Energieträger fehlt).',
  consumption_unknown: 'Es ist kein Verbrauch erfasst.',
  area_unknown: 'Es ist keine Fläche erfasst.',
  hot_water_energy_unknown:
    'Die Vergleichswerte enthalten Warmwasser, das Warmwasser wird aber nicht zentral über den Heizkreis bereitet. Vergleichswerte ohne Warmwasser erfassen.',
}

/**
 * § 6a Abs. 3 Nr. 4 HeizKV: Vergleichswerte sind erfasst, für einzelne
 * Nutzer ist der Vergleich aber nicht möglich (eine Warnung je Heizkreis
 * und Grund).
 */
export function consumptionBenchmarkIssues(
  data: AppDataFile,
  period: BillingPeriod,
  output: CalculationOutput,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId, consumptionBenchmark }) =>
      billingPeriodId === period.id && consumptionBenchmark,
  )
  for (const circuit of circuits) {
    const byReason = new Map<keyof typeof BENCHMARK_REASON_TEXT, number>()
    for (const tenant of output.tenants) {
      if (
        tenant.isVacancy ||
        tenant.ownBasis?.buildingId !== circuit.buildingId
      )
        continue
      const result = compareTenantWithConsumptionBenchmark(
        output,
        tenant.id,
        circuit,
      )
      if (result.status !== 'unavailable') continue
      const { reason } = result
      if (
        reason === 'no_benchmark' ||
        reason === 'vacancy' ||
        reason === 'not_in_calculation'
      )
        continue
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1)
    }
    for (const [reason, count] of byReason)
      add(
        issue(
          'warning',
          'heating.consumption_benchmark_not_comparable',
          'heating',
          'Vergleich mit dem Durchschnittsnutzer nicht möglich',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail: `${count === 1 ? 'Für eine Nutzung' : `Für ${count} Nutzungen`} kann der Verbrauch nicht mit den Vergleichswerten (§ 6a Abs. 3 Nr. 4 HeizKV) verglichen werden: ${BENCHMARK_REASON_TEXT[reason]}`,
          },
        ),
      )
  }
}

function normalizedDescription(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE')
}

/**
 * Gleich bezeichnete Belege derselben Kostenart am selben Tag wirken in der
 * Abrechnung wie eine Doppelposition. Nicht löschen, sondern eindeutig
 * bezeichnen oder Doppelerfassung prüfen.
 */
export function ambiguousCostEntries(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  for (const category of periodCategories(data, period.id)) {
    const groups = new Map<string, typeof data.billingData.costEntries>()
    for (const entry of data.billingData.costEntries) {
      if (entry.costCategoryId !== category.id || !entry.date) continue
      if (entry.amountCents === 0) continue
      const key = `${entry.date}|${normalizedDescription(entry.description)}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    for (const entries of groups.values()) {
      if (entries.length < 2) continue
      const [first] = entries
      const label = category.statementText ?? category.label
      const description = first!.description?.trim() || 'ohne Beschreibung'
      add(
        issue(
          'warning',
          'costs.entry_ambiguous',
          'costs',
          'Gleich bezeichnete Belege am selben Tag',
          {
            entity: { type: 'CostEntry', id: first!.id },
            detail: `${label}: ${entries.length} Belege vom ${formatDate(first!.date!)} mit der Bezeichnung „${description}“ (${entries
              .map(({ amountCents }) => formatEuro(amountCents))
              .join(
                ', ',
              )}). Bitte anhand der Originalrechnungen die Leistungen eindeutig bezeichnen (z. B. „Abgaswegeüberprüfung/Emissionsmessung“ und „Kehrarbeiten“) oder eine Doppelerfassung bereinigen.`,
          },
        ),
      )
    }
  }
}
