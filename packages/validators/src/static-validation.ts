import {
  createCalculationInput,
  resolveMeteredConsumption,
  resolveShippingAddress,
  type MeteredConsumptionIssue,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import {
  blank,
  occupancyMatchesScope,
  periodCategories,
  periodOccupancies,
  validIban,
  wholeYear,
} from './helpers'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void
type CategoryScope = NonNullable<
  ReturnType<typeof periodCategories>[number]['scope']
>

function masterData(data: AppDataFile, period: BillingPeriod, add: Add): void {
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const owner =
    property &&
    data.masterData.ownerCompanies.find(
      ({ id }) => id === property.ownerCompanyId,
    )
  if (!owner)
    add(
      issue(
        'error',
        'master_data.owner_company_missing',
        'master_data',
        'Eigentümergesellschaft fehlt',
        { entity: { type: 'BillingPeriod', id: period.id } },
      ),
    )
  if (
    !property?.address ||
    blank(property.address.street) ||
    blank(property.address.postalCodeAndCity)
  )
    add(
      issue(
        'error',
        'master_data.property_address_missing',
        'master_data',
        'Objektadresse ist unvollständig',
        { entity: { type: 'Property', id: property?.id ?? period.propertyId } },
      ),
    )
  const iban = property?.bankAccount?.iban || owner?.bankAccount?.iban
  if (blank(iban))
    add(
      issue('error', 'master_data.iban_missing', 'master_data', 'IBAN fehlt', {
        entity: { type: 'Property', id: property?.id ?? period.propertyId },
      }),
    )
  else if (!validIban(iban!))
    add(
      issue(
        'warning',
        'master_data.iban_invalid',
        'master_data',
        'IBAN ist ungültig',
        { entity: { type: 'Property', id: property?.id ?? period.propertyId } },
      ),
    )
}

function periodChecks(period: BillingPeriod, add: Add): void {
  if (period.periodStart > period.periodEnd)
    add(
      issue(
        'error',
        'billing_period.invalid_range',
        'billing_period',
        'Abrechnungszeitraum ist ungültig',
        { entity: { type: 'BillingPeriod', id: period.id } },
      ),
    )
  if (
    !period.periodStart.startsWith(`${period.year}-`) ||
    !period.periodEnd.startsWith(`${period.year}-`)
  )
    add(
      issue(
        'error',
        'billing_period.year_mismatch',
        'billing_period',
        'Zeitraum und Abrechnungsjahr stimmen nicht überein',
        { entity: { type: 'BillingPeriod', id: period.id } },
      ),
    )
  else if (!wholeYear(period))
    add(
      issue(
        'info',
        'billing_period.partial_year',
        'billing_period',
        'Teiljahresabrechnung',
        { entity: { type: 'BillingPeriod', id: period.id } },
      ),
    )
}

function occupancies(data: AppDataFile, period: BillingPeriod, add: Add): void {
  const rows = periodOccupancies(data, period.id)
  const units = new Map(data.masterData.units.map((unit) => [unit.id, unit]))
  const heatingNeeded = periodCategories(data, period.id).some(
    ({ kind }) => kind === 'heating',
  )
  for (const row of rows) {
    const from = row.from ?? period.periodStart
    const to = row.to ?? period.periodEnd
    const entity = { type: 'OccupancyPeriod', id: row.id }
    if (from > to)
      add(
        issue(
          'error',
          'occupancy.invalid_range',
          'occupancy',
          'Nutzungszeitraum ist ungültig',
          { entity },
        ),
      )
    if (from > period.periodEnd || to < period.periodStart)
      add(
        issue(
          'warning',
          'occupancy.outside_period',
          'occupancy',
          'Nutzung liegt außerhalb des Abrechnungszeitraums',
          { entity },
        ),
      )
    const unit = units.get(row.unitId)
    if (!unit?.usableAreaSqm || unit.usableAreaSqm.value <= 0)
      add(
        issue(
          'error',
          'occupancy.usable_area_missing',
          'occupancy',
          'Nutzfläche fehlt',
          { entity: { type: 'Unit', id: row.unitId } },
        ),
      )
    if (
      heatingNeeded &&
      (!unit?.heatedAreaSqm || unit.heatedAreaSqm.value <= 0)
    )
      add(
        issue(
          'error',
          'occupancy.heated_area_missing',
          'occupancy',
          'Beheizte Fläche fehlt',
          { entity: { type: 'Unit', id: row.unitId } },
        ),
      )
    if (row.kind === 'tenant') {
      const tenancy = data.masterData.tenancies.find(
        ({ id }) => id === row.tenancyId,
      )
      const property = data.masterData.properties.find(
        ({ id }) => id === period.propertyId,
      )
      const shipping = resolveShippingAddress({
        tenancy,
        occupancy: row,
        property: property ?? {},
        billingPeriod: period,
      })
      const tenancyEntity = { type: 'Tenancy', id: row.tenancyId ?? row.id }
      if (!shipping)
        add(
          issue(
            'error',
            'occupancy.shipping_address_missing',
            'occupancy',
            'Versandadresse fehlt',
            {
              detail:
                'Weder eine Versandanschrift noch eine Wohnungs- oder Objektanschrift mit PLZ/Ort ist erfasst.',
              entity: tenancyEntity,
            },
          ),
        )
      else if (shipping.movedOut)
        add(
          issue(
            'info',
            'occupancy.shipping_address_previous',
            'occupancy',
            'Ausgezogen: Abrechnung geht an die bisherige Anschrift',
            {
              detail: `Ohne neue Anschrift wird an ${shipping.street}, ${shipping.postalCodeAndCity} adressiert. Eine bekannte neue Anschrift beim Nutzer eintragen.`,
              entity: tenancyEntity,
            },
          ),
        )
      const matches = data.billingData.prepayments.filter(
        ({ occupancyPeriodId }) => occupancyPeriodId === row.id,
      )
      if (matches.length === 0)
        add(
          issue(
            'warning',
            'prepayments.missing',
            'prepayments',
            'Vorauszahlung fehlt',
            { entity },
          ),
        )
      if (matches.length > 1)
        add(
          issue(
            'error',
            'prepayments.duplicate',
            'prepayments',
            'Mehrere Vorauszahlungen erfasst',
            { entity },
          ),
        )
      for (const payment of matches) {
        const amount =
          payment.mode === 'monthly'
            ? payment.monthlyAmountCents
            : payment.mode === 'annual'
              ? payment.annualAmountCents
              : 0
        if (amount < 0)
          add(
            issue(
              'warning',
              'prepayments.negative',
              'prepayments',
              'Negative Vorauszahlung',
              { entity: { type: 'Prepayment', id: payment.id } },
            ),
          )
      }
    }
  }
}

function scopeHasRecipients(
  data: AppDataFile,
  periodId: string,
  scope: CategoryScope,
): boolean {
  return periodOccupancies(data, periodId).some((row) =>
    occupancyMatchesScope(data, row, scope),
  )
}

function costs(data: AppDataFile, period: BillingPeriod, add: Add): void {
  const categories = periodCategories(data, period.id)
  if (categories.length === 0)
    add(
      issue(
        'warning',
        'costs.category_missing',
        'costs',
        'Kostenbereiche fehlen',
        { entity: { type: 'BillingPeriod', id: period.id } },
      ),
    )
  const previous = data.billingData.billingPeriods.find(
    ({ year, propertyId }) =>
      year === period.year - 1 && propertyId === period.propertyId,
  )
  const previousCategories = previous ? periodCategories(data, previous.id) : []
  for (const [standardKey, status] of Object.entries(
    period.standardCostCategoryStatus ?? {},
  )) {
    if (
      status.active &&
      !categories.some((category) => category.standardKey === standardKey)
    )
      add(
        issue(
          'warning',
          'costs.standard_category_missing',
          'costs',
          'Aktive Standardkostenart fehlt',
          { entity: { type: 'BillingPeriod', id: period.id } },
        ),
      )
    if (!status.active && blank(status.reason))
      add(
        issue(
          'warning',
          'costs.standard_category_disabled_without_reason',
          'costs',
          'Deaktivierte Standardkostenart ist nicht begründet',
          { entity: { type: 'BillingPeriod', id: period.id } },
        ),
      )
  }
  for (const category of categories) {
    const entity = { type: 'CostCategory', id: category.id }
    if (blank(category.standardKey))
      add(
        issue(
          'info',
          'costs.standard_category_missing',
          'costs',
          'Standardkostenart fehlt',
          { entity },
        ),
      )
    if (category.kind !== 'heating' && !category.allocationKey)
      add(
        issue(
          'error',
          'costs.allocation_key_missing',
          'costs',
          'Umlageschlüssel fehlt',
          { entity },
        ),
      )
    if (category.scope) {
      const scope = category.scope
      if (
        scope.kind === 'building' &&
        !data.masterData.buildings.some(
          ({ id, propertyId }) =>
            id === scope.buildingId && propertyId === period.propertyId,
        )
      )
        add(
          issue(
            'error',
            'costs.scope_invalid',
            'costs',
            'Kostenbereich ist ungültig',
            { entity },
          ),
        )
      else if (!scopeHasRecipients(data, period.id, scope))
        add(
          issue(
            'error',
            'costs.scope_without_recipients',
            'costs',
            'Kostenbereich hat keine Empfänger',
            { entity },
          ),
        )
    }
    const entries = data.billingData.costEntries.filter(
      ({ costCategoryId }) => costCategoryId === category.id,
    )
    const total = entries.reduce((sum, { amountCents }) => sum + amountCents, 0)
    for (const entry of entries)
      if (entry.amountCents < 0)
        add(
          issue(
            'warning',
            'costs.negative_amount',
            'costs',
            'Negativer Belegbetrag',
            { entity: { type: 'CostEntry', id: entry.id } },
          ),
        )
    if (
      category.totalAmountCents != null &&
      Math.abs(total - category.totalAmountCents) > 1
    )
      add(
        issue(
          'warning',
          'costs.entry_total_mismatch',
          'costs',
          'Belegsumme stimmt nicht mit Kostenart überein',
          { entity },
        ),
      )
    if (category.totalAmountCents != null && category.totalAmountCents < 0)
      add(
        issue(
          'warning',
          'costs.negative_amount',
          'costs',
          'Negativer Kostenbetrag',
          { entity },
        ),
      )
    const effectiveAmount =
      entries.length > 0 ? total : (category.totalAmountCents ?? 0)
    // Non-allocable (NICHT_UML) costs stay with the landlord and need no recipient.
    if (
      category.allocationKey === 'direct' &&
      category.betrkvCategory !== 'NICHT_UML' &&
      effectiveAmount !== 0
    )
      add(
        issue(
          'error',
          'costs.direct_unassigned',
          'costs',
          'Direkte Kosten sind keinem Nutzer zugeordnet',
          { entity },
        ),
      )
    const denominator =
      category.allocationKey === 'usable_area'
        ? 'usableAreaSqm'
        : category.allocationKey === 'heated_area'
          ? 'heatedAreaSqm'
          : undefined
    if (denominator) {
      const unitIds = new Set(
        periodOccupancies(data, period.id)
          .filter((row) =>
            category.scope
              ? occupancyMatchesScope(data, row, category.scope)
              : true,
          )
          .map(({ unitId }) => unitId),
      )
      const sum = data.masterData.units
        .filter(({ id }) => unitIds.has(id))
        .reduce((value, unit) => value + (unit[denominator]?.value ?? 0), 0)
      if (sum <= 0)
        add(
          issue(
            'error',
            'costs.allocation_basis_zero',
            'costs',
            'Umlagebasis ist null',
            { entity },
          ),
        )
    }
    const match = previousCategories.find(
      (old) =>
        (category.standardKey && old.standardKey === category.standardKey) ||
        old.label === category.label,
    )
    const current = effectiveAmount
    const oldEntries = match
      ? data.billingData.costEntries.filter(
          ({ costCategoryId }) => costCategoryId === match.id,
        )
      : []
    const old = match
      ? oldEntries.length > 0
        ? oldEntries.reduce((sum, entry) => sum + entry.amountCents, 0)
        : match.totalAmountCents
      : undefined
    if (
      old != null &&
      old > 0 &&
      current - old > 5_000 &&
      (current - old) / old > 0.3
    )
      add(
        issue(
          'warning',
          'costs.year_over_year_increase',
          'costs',
          'Kostensteigerung gegenüber Vorjahr',
          { entity },
        ),
      )
    for (const entry of entries) documents(entry, data, add)
  }
}

function documents(
  entry: AppDataFile['billingData']['costEntries'][number],
  data: AppDataFile,
  add: Add,
): void {
  const entity = { type: 'CostEntry', id: entry.id }
  if (
    entry.amountCents !== 0 &&
    blank(entry.receiptReference) &&
    !entry.attachment
  )
    add(
      issue(
        'warning',
        'documents.receipt_missing',
        'documents',
        'Belegverknüpfung fehlt',
        { entity },
      ),
    )
  if (entry.bookingLink && !validBookingLink(data, entry.bookingLink))
    add(
      issue(
        'warning',
        'documents.booking_link_invalid',
        'documents',
        'Buchungslink ist ungültig',
        { entity },
      ),
    )
  if (entry.externalPayment?.confirmed && blank(entry.externalPayment.reason))
    add(
      issue(
        'warning',
        'documents.external_payment_reason_missing',
        'documents',
        'Begründung für externe Zahlung fehlt',
        { entity },
      ),
    )
  if (
    entry.amountCents !== 0 &&
    !entry.bookingLink &&
    !entry.externalPayment?.confirmed
  )
    add(
      issue(
        'error',
        'documents.booking_link_missing',
        'documents',
        'Buchungslink fehlt',
        { entity },
      ),
    )
}

function validBookingLink(
  data: AppDataFile,
  link: { readonly bankBookingId: string; readonly splitId?: string | null },
): boolean {
  const booking = data.billingData.bankBookings.find(
    ({ id }) => id === link.bankBookingId,
  )
  if (!booking) return false
  return (
    link.splitId == null ||
    (booking.splits ?? []).some(({ id }) => id === link.splitId)
  )
}

function deliveryDocuments(
  delivery: AppDataFile['billingData']['fuelDeliveries'][number],
  data: AppDataFile,
  add: Add,
): void {
  const entity = { type: 'FuelDelivery', id: delivery.id }
  if (delivery.amountCents != null && delivery.amountCents < 0)
    add(
      issue(
        'warning',
        'costs.negative_amount',
        'costs',
        'Negativer Lieferbetrag',
        { entity },
      ),
    )
  if (delivery.amountCents && blank(delivery.receiptReference))
    add(
      issue(
        'warning',
        'documents.receipt_missing',
        'documents',
        'Lieferbeleg fehlt',
        { entity },
      ),
    )
  if (delivery.bookingLink && !validBookingLink(data, delivery.bookingLink))
    add(
      issue(
        'error',
        'documents.booking_link_invalid',
        'documents',
        'Buchungslink ist ungültig',
        { entity },
      ),
    )
  if (
    delivery.externalPayment?.confirmed &&
    blank(delivery.externalPayment.reason)
  )
    add(
      issue(
        'warning',
        'documents.external_payment_reason_missing',
        'documents',
        'Begründung für externe Zahlung fehlt',
        { entity },
      ),
    )
  if (
    delivery.amountCents &&
    !delivery.bookingLink &&
    !delivery.externalPayment?.confirmed
  )
    add(
      issue(
        'error',
        'documents.booking_link_missing',
        'documents',
        'Buchungslink fehlt',
        { entity },
      ),
    )
}

const METERED_OCCUPANCY_CODES = new Set([
  'metered.occupancy_missing',
  'metered.occupancy_gap',
  'metered.occupancy_overlap',
  'metered.occupancy_invalid_range',
])

/**
 * Places a metered problem where it is corrected: incomplete or invalid
 * occupancy periods in the occupancy step, readings and assignments in the
 * meter step.
 */
function meteredIssue(
  data: AppDataFile,
  problem: MeteredConsumptionIssue,
  circuit: NonNullable<ValidationIssue['entity']>,
): ValidationIssue {
  const meter = data.masterData.meters.find(({ id }) => id === problem.meterId)
  const unit = data.masterData.units.find(({ id }) => id === problem.unitId)
  const context = [
    meter ? `Zähler ${meter.meterNumber ?? 'ohne Nummer'}` : undefined,
    unit
      ? `Wohnung ${unit.label ?? unit.location ?? 'ohne Bezeichnung'}`
      : undefined,
  ].filter(Boolean)
  const detail = context.length
    ? `${context.join(' · ')}: ${problem.detail}`
    : problem.detail
  if (METERED_OCCUPANCY_CODES.has(problem.code))
    return issue(
      'error',
      problem.code,
      'occupancy',
      'Nutzerzeiträume für Wohnungswärme sind unvollständig',
      {
        detail,
        entity: problem.occupancyId
          ? { type: 'OccupancyPeriod', id: problem.occupancyId }
          : problem.unitId
            ? { type: 'Unit', id: problem.unitId }
            : circuit,
      },
    )
  return issue(
    'error',
    problem.code,
    'meters',
    'Wohnungswärme-Ablesung fehlt oder ist ungültig',
    {
      detail,
      entity: problem.meterId
        ? { type: 'Meter', id: problem.meterId }
        : circuit,
    },
  )
}

function heating(data: AppDataFile, period: BillingPeriod, add: Add): void {
  const categories = periodCategories(data, period.id)
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  if (
    categories.some(({ kind }) => kind === 'heating') &&
    circuits.length === 0
  )
    add(
      issue('error', 'heating.circuit_missing', 'heating', 'Heizkreis fehlt', {
        entity: { type: 'BillingPeriod', id: period.id },
      }),
    )
  const units = data.masterData.units.filter(
    ({ propertyId }) => propertyId === period.propertyId,
  )
  const occupancies = periodOccupancies(data, period.id)
  const unitName = (unit: (typeof units)[number]) =>
    unit.label ?? unit.location ?? 'ohne Bezeichnung'
  if (circuits.length > 0)
    for (const unit of units.filter(({ buildingId }) => !buildingId))
      add(
        issue(
          'error',
          'master_data.unit_building_missing',
          'master_data',
          'Wohnung ist keinem Gebäude zugeordnet',
          {
            detail: `Wohnung ${unitName(unit)}: Ohne Gebäude gehört sie zu keinem Heizkreis und erhält keine gebäudebezogenen Heizkosten.`,
            entity: { type: 'Unit', id: unit.id },
          },
        ),
      )
  const heatingCents = (buildingId: string, includeProperty: boolean) =>
    categories
      .filter(
        ({ kind, scope }) =>
          kind === 'heating' &&
          (scope?.kind === 'building'
            ? scope.buildingId === buildingId
            : includeProperty && (!scope || scope.kind === 'property')),
      )
      .reduce((sum, category) => {
        const entries = data.billingData.costEntries.filter(
          ({ costCategoryId }) => costCategoryId === category.id,
        )
        return (
          sum +
          (entries.length > 0
            ? entries.reduce((total, entry) => total + entry.amountCents, 0)
            : (category.totalAmountCents ?? 0))
        )
      }, 0)
  for (const circuit of circuits) {
    const entity = { type: 'HeatingCircuit', id: circuit.id }
    const circuitUnits = units.filter(
      ({ buildingId }) => buildingId === circuit.buildingId,
    )
    const circuitOccupancies = occupancies.filter(({ unitId }) =>
      circuitUnits.some(({ id }) => id === unitId),
    )
    if (
      circuitOccupancies.length === 0 &&
      heatingCents(circuit.buildingId, false) > 0
    )
      add(
        issue(
          'error',
          'heating.circuit_without_units',
          'heating',
          'Heizkreis hat Heizkosten, aber keine Nutzungen',
          {
            detail: `${data.masterData.buildings.find(({ id }) => id === circuit.buildingId)?.name ?? 'Gebäude'}: Ordne die Wohnungen dem Gebäude zu, sonst werden diese Heizkosten nicht auf Nutzer verteilt.`,
            entity,
          },
        ),
      )
    if (
      (circuit.consumptionMode ?? 'manual') === 'manual' &&
      heatingCents(circuit.buildingId, true) > 0
    )
      for (const occupancy of circuitOccupancies.filter(
        ({ kind, consumptionUnits }) =>
          kind !== 'vacancy' && !((consumptionUnits?.value ?? 0) > 0),
      )) {
        const unit = circuitUnits.find(({ id }) => id === occupancy.unitId)
        add(
          issue(
            'warning',
            'heating.consumption_units_missing',
            'occupancy',
            'Verbrauchseinheiten fehlen oder sind 0',
            {
              detail: `Wohnung ${unit ? unitName(unit) : 'ohne Bezeichnung'}: Ohne Verbrauchswert trägt der Nutzer nur den Grundkostenanteil. Bitte Ablesung oder Schätzung des Messdienstes eintragen oder bewusst bestätigen.`,
              entity: { type: 'OccupancyPeriod', id: occupancy.id },
            },
          ),
        )
      }
    if (circuit.consumptionMode === 'metered_kwh') {
      try {
        const resolution = resolveMeteredConsumption(
          createCalculationInput(data, period.id),
        )
        if (!resolution.ok) {
          for (const problem of resolution.issues.filter(
            ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
          ))
            add(meteredIssue(data, problem, entity))
        }
      } catch {
        add(
          issue(
            'error',
            'metered.input_invalid',
            'meters',
            'Wohnungswärme-Ablesungen können nicht geprüft werden',
            { entity },
          ),
        )
      }
    }
    const sources = data.billingData.energySources.filter(
      ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
    )
    if (sources.length === 0)
      add(
        issue(
          'error',
          'heating.energy_source_missing',
          'heating',
          'Energiequelle fehlt',
          { entity },
        ),
      )
    for (const source of sources) {
      const deliveries = data.billingData.fuelDeliveries.filter(
        ({ energySourceId, billingPeriodId }) =>
          energySourceId === source.id && billingPeriodId === period.id,
      )
      if (deliveries.length === 0)
        add(
          issue(
            'warning',
            'heating.delivery_missing',
            'heating',
            'Jahreslieferung fehlt',
            { entity: { type: 'EnergySource', id: source.id } },
          ),
        )
      for (const delivery of deliveries) deliveryDocuments(delivery, data, add)
      if (source.calorificValueKwhPerUnit == null)
        add(
          issue(
            'warning',
            'co2.calorific_value_missing',
            'co2',
            'Heizwert fehlt',
            { entity: { type: 'EnergySource', id: source.id } },
          ),
        )
      if (source.co2FactorKgPerKwh == null)
        add(
          issue('warning', 'co2.factor_missing', 'co2', 'CO₂-Faktor fehlt', {
            entity: { type: 'EnergySource', id: source.id },
          }),
        )
    }
    if (
      circuit.co2?.mode !== 'manual' &&
      circuit.co2?.co2PricePerTonCents == null &&
      sources.some(
        (source) =>
          (source.co2FactorKgPerKwh ?? circuit.co2?.co2FactorKgPerKwh ?? 0) > 0,
      )
    )
      add(
        issue(
          'warning',
          'co2.price_missing',
          'co2',
          'CO₂-Preis fehlt – die Berechnung setzt ersatzweise 45 €/t an',
          {
            entity,
            detail:
              'Bitte den für das Abrechnungsjahr geltenden CO₂-Preis nach BEHG am Heizkreis hinterlegen.',
          },
        ),
      )
    const consumption =
      circuit.overrides?.consumptionSharePercent ??
      period.heatingDefaults?.consumptionSharePercent ??
      70
    const base =
      circuit.overrides?.baseSharePercent ??
      period.heatingDefaults?.baseSharePercent ??
      100 - consumption
    if (base + consumption !== 100)
      add(
        issue(
          'error',
          'heating.split_not_100',
          'heating',
          'Grund- und Verbrauchsanteil ergeben nicht 100 %',
          { entity },
        ),
      )
    if (consumption < 50 || consumption > 70)
      add(
        issue(
          'error',
          'heating.consumption_share_out_of_range',
          'heating',
          'Verbrauchsanteil liegt außerhalb 50–70 %',
          { entity },
        ),
      )
    if (
      consumption !== 70 &&
      blank(period.heatingDefaults?.deviationJustification)
    )
      add(
        issue(
          'warning',
          'heating.nonstandard_split_without_reason',
          'heating',
          'Abweichender Heizkostenschlüssel ist nicht begründet',
          { entity },
        ),
      )
    if (
      circuit.hasCentralHotWater &&
      (circuit.hotWaterSharePercent == null ||
        circuit.hotWaterSharePercent < 18 ||
        circuit.hotWaterSharePercent > 70)
    )
      add(
        issue(
          'warning',
          'heating.hot_water_share_implausible',
          'hot_water',
          'Warmwasseranteil liegt außerhalb 18–70 %',
          { entity },
        ),
      )
    if (
      circuit.co2?.mode === 'manual' &&
      (circuit.co2.levyCents == null ||
        circuit.co2.landlordSharePercent == null ||
        circuit.co2.intensityKgPerSqmYear == null)
    )
      add(
        issue(
          'warning',
          'co2.manual_values_incomplete',
          'co2',
          'Manuelle CO₂-Werte sind unvollständig',
          { entity },
        ),
      )
  }
}

function meters(data: AppDataFile, period: BillingPeriod, add: Add): void {
  const meters = data.masterData.meters.filter(
    ({ propertyId, validFrom, validTo }) =>
      propertyId === period.propertyId &&
      (validFrom == null || validFrom <= period.periodEnd) &&
      (validTo == null || validTo >= period.periodStart),
  )
  for (const meter of meters) {
    const entity = { type: 'Meter', id: meter.id }
    if (blank(meter.meterNumber))
      add(
        issue(
          blank(meter.maloId) ? 'warning' : 'info',
          'meters.number_missing',
          'meters',
          'Zählernummer fehlt',
          { entity },
        ),
      )
    else if (meter.meterNumberStatus !== 'confirmed')
      add(
        issue(
          'warning',
          'meters.number_unconfirmed',
          'meters',
          'Zählernummer ist nicht bestätigt',
          { entity },
        ),
      )
    const status = data.billingData.meterBillingStatuses.find(
      ({ meterId, billingPeriodId, year }) =>
        meterId === meter.id &&
        (billingPeriodId === period.id ||
          (!billingPeriodId && year === period.year)),
    )
    if (!status)
      add(
        issue(
          'warning',
          'meters.status_missing',
          'meters',
          'Jahresstatus des Zählers fehlt',
          { entity },
        ),
      )
    else {
      if (!status.bookingPresent)
        add(
          issue(
            'warning',
            'meters.booking_missing',
            'meters',
            'Zählerbuchung fehlt',
            { entity },
          ),
        )
      if (!status.annualInvoicePresent)
        add(
          issue(
            'warning',
            'meters.annual_invoice_missing',
            'meters',
            'Jahresrechnung fehlt',
            { entity },
          ),
        )
      if (status.estimateAmountCents != null && !status.annualInvoicePresent)
        add(
          issue(
            'warning',
            'meters.estimate_only',
            'meters',
            'Nur ein Schätzwert liegt vor',
            { entity },
          ),
        )
    }
  }
}

export function collectStaticIssues(
  data: AppDataFile,
  period: BillingPeriod,
): ValidationIssue[] {
  const result: ValidationIssue[] = []
  const add: Add = (value) => result.push(value)
  masterData(data, period, add)
  periodChecks(period, add)
  occupancies(data, period, add)
  costs(data, period, add)
  heating(data, period, add)
  meters(data, period, add)
  return result
}
