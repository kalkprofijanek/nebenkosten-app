import type { LegacyUnmappedEntry, V3Abrechnung, V3Nutzer } from '../..'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { REDACTED_COST_KEY, reportBillingPeriodChanges } from './billing-report'
import { mapBillingStatus, mapScope, quantity, requiredYear } from './mapping'
import { mapCost } from './costs'
import { mapHeating } from './heating'
import { mapAuditEvents } from './meters-bookings-audit'
import type { PropertyContext } from './shared'
import { stringOrNullish, withLegacy } from './shared'
import type { MigrationState } from './state'
import { buildingForUser, isVacancy, userDisplayName } from './tenancy-helpers'
import { addUnmapped, preserveUnknownKeys } from './unknown-fields'
import {
  optionalBoolean,
  optionalCents,
  optionalDate,
  optionalInteger,
  optionalNonNegative,
  optionalPercent,
  optionalTimestamp,
} from './values'

export function mapBillingPeriod(
  state: MigrationState,
  context: MigrationContext,
  period: V3Abrechnung,
  path: JsonPath,
  property: PropertyContext,
): number | undefined {
  const legacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    period,
    [
      'id',
      'jahr',
      'zeitraum',
      'status',
      'versanddatum',
      'vorgaben',
      'gesamt',
      'nutzer',
      'kostenarten',
      'standardKostenartenStatus',
      'heizkreise',
      'brennstoff',
      'co2',
      'hinweise',
      'anschreiben',
      '_protokoll',
      '_ts',
    ],
    legacy,
    path,
  )
  if (period.zeitraum)
    preserveUnknownKeys(
      context,
      period.zeitraum,
      ['von', 'bis'],
      legacy,
      [...path, 'zeitraum'],
      ['zeitraum'],
    )
  if (period.vorgaben)
    preserveUnknownKeys(
      context,
      period.vorgaben,
      [
        'verbrauch_proz',
        'grund_proz',
        'grundkosten_umlage',
        'solar_proz',
        'betriebsstrom_proz',
        'mwst_modus',
        'abweichung_begruendung',
      ],
      legacy,
      [...path, 'vorgaben'],
      ['vorgaben'],
    )
  if (period.gesamt)
    preserveUnknownKeys(
      context,
      period.gesamt,
      ['flaeche', 'flaeche_hzg', 'personen', 'einheiten', 'we'],
      legacy,
      [...path, 'gesamt'],
      ['gesamt'],
    )
  if (period.hinweise)
    preserveUnknownKeys(
      context,
      period.hinweise,
      ['allgemein', 'guthaben', 'nachzahlung'],
      legacy,
      [...path, 'hinweise'],
      ['hinweise'],
    )
  if (period.anschreiben)
    preserveUnknownKeys(
      context,
      period.anschreiben,
      ['aktiv', 'text'],
      legacy,
      [...path, 'anschreiben'],
      ['anschreiben'],
    )
  const year = requiredYear(context, period.jahr, [...path, 'jahr'])
  let start = optionalDate(
    context,
    period.zeitraum?.von,
    [...path, 'zeitraum', 'von'],
    ['zeitraum', 'von'],
    legacy,
  )
  let end = optionalDate(
    context,
    period.zeitraum?.bis,
    [...path, 'zeitraum', 'bis'],
    ['zeitraum', 'bis'],
    legacy,
  )
  if (year !== undefined && !start && !end) {
    start = `${year}-01-01`
    end = `${year}-12-31`
    context.issue(
      'info',
      'migration.period_derived_from_year',
      'Der volle Abrechnungszeitraum wurde aus dem Jahr abgeleitet',
      [...path, 'zeitraum'],
    )
  }
  if (!start || !end)
    context.issue(
      'error',
      'migration.required_period_invalid',
      'Der Abrechnungszeitraum fehlt oder ist ungültig',
      [...path, 'zeitraum'],
    )
  let baseCostAreaBasis: 'heated_area' | 'usable_area' | undefined
  let vatMode: 'brutto' | 'netto' | undefined
  if (period.vorgaben?.grundkosten_umlage === 'm2_nf')
    baseCostAreaBasis = 'usable_area'
  else if (period.vorgaben?.grundkosten_umlage === 'm2_nf_hzg')
    baseCostAreaBasis = 'heated_area'
  else if (period.vorgaben?.grundkosten_umlage != null) {
    context.issue(
      'warning',
      'migration.unknown_base_cost_basis',
      'Eine unbekannte Grundkostenbasis wurde nicht übernommen',
      [...path, 'vorgaben', 'grundkosten_umlage'],
    )
    addUnmapped(
      context,
      legacy,
      ['vorgaben', 'grundkosten_umlage'],
      [...path, 'vorgaben', 'grundkosten_umlage'],
      period.vorgaben.grundkosten_umlage,
    )
  }
  if (
    period.vorgaben?.mwst_modus === 'brutto' ||
    period.vorgaben?.mwst_modus === 'netto'
  )
    vatMode = period.vorgaben.mwst_modus
  else if (period.vorgaben?.mwst_modus != null) {
    context.issue(
      'warning',
      'migration.unknown_vat_mode',
      'Ein unbekannter Umsatzsteuermodus wurde nicht übernommen',
      [...path, 'vorgaben', 'mwst_modus'],
    )
    addUnmapped(
      context,
      legacy,
      ['vorgaben', 'mwst_modus'],
      [...path, 'vorgaben', 'mwst_modus'],
      period.vorgaben.mwst_modus,
    )
  }
  const defaults = period.vorgaben
    ? {
        consumptionSharePercent: optionalPercent(
          context,
          period.vorgaben.verbrauch_proz,
          [...path, 'vorgaben', 'verbrauch_proz'],
          ['vorgaben', 'verbrauch_proz'],
          legacy,
        ),
        baseSharePercent: optionalPercent(
          context,
          period.vorgaben.grund_proz,
          [...path, 'vorgaben', 'grund_proz'],
          ['vorgaben', 'grund_proz'],
          legacy,
        ),
        baseCostAreaBasis,
        solarSharePercent: optionalPercent(
          context,
          period.vorgaben.solar_proz,
          [...path, 'vorgaben', 'solar_proz'],
          ['vorgaben', 'solar_proz'],
          legacy,
        ),
        operatingElectricitySharePercent: optionalPercent(
          context,
          period.vorgaben.betriebsstrom_proz,
          [...path, 'vorgaben', 'betriebsstrom_proz'],
          ['vorgaben', 'betriebsstrom_proz'],
          legacy,
        ),
        vatMode,
        deviationJustification: stringOrNullish(
          period.vorgaben.abweichung_begruendung,
        ),
      }
    : undefined
  const totals = period.gesamt
    ? {
        usableAreaSqm: quantity(
          context,
          period.gesamt.flaeche,
          'm2',
          [...path, 'gesamt', 'flaeche'],
          ['gesamt', 'flaeche'],
          legacy,
        ),
        heatedAreaSqm: quantity(
          context,
          period.gesamt.flaeche_hzg,
          'm2',
          [...path, 'gesamt', 'flaeche_hzg'],
          ['gesamt', 'flaeche_hzg'],
          legacy,
        ),
        persons: quantity(
          context,
          period.gesamt.personen,
          'personen',
          [...path, 'gesamt', 'personen'],
          ['gesamt', 'personen'],
          legacy,
        ),
        consumptionUnits: quantity(
          context,
          period.gesamt.einheiten,
          'einheiten',
          [...path, 'gesamt', 'einheiten'],
          ['gesamt', 'einheiten'],
          legacy,
        ),
        residentialUnitCount: quantity(
          context,
          period.gesamt.we,
          'stueck',
          [...path, 'gesamt', 'we'],
          ['gesamt', 'we'],
          legacy,
        ),
      }
    : undefined
  const standardCostCategoryStatus = period.standardKostenartenStatus
    ? Object.fromEntries(
        Object.entries(period.standardKostenartenStatus).map(([key, value]) => {
          preserveUnknownKeys(
            context,
            value,
            ['aktiv', 'grund'],
            legacy,
            [...path, 'standardKostenartenStatus', REDACTED_COST_KEY],
            ['standardKostenartenStatus', key],
          )
          return [
            key,
            {
              active:
                optionalBoolean(
                  context,
                  value.aktiv,
                  [
                    ...path,
                    'standardKostenartenStatus',
                    REDACTED_COST_KEY,
                    'aktiv',
                  ],
                  ['standardKostenartenStatus', key, 'aktiv'],
                  legacy,
                ) ?? false,
              reason: stringOrNullish(value.grund),
            },
          ]
        }),
      )
    : undefined
  if (year !== undefined && start && end) {
    const billingPeriodIndex = state.billingPeriods.length
    reportBillingPeriodChanges(
      context,
      period,
      path,
      billingPeriodIndex,
      legacy.length > 0,
    )
    state.billingPeriods = [
      ...state.billingPeriods,
      withLegacy(
        {
          id: period.id,
          propertyId: property.propertyId,
          year,
          periodStart: start,
          periodEnd: end,
          status: mapBillingStatus(
            context,
            period.status,
            [...path, 'status'],
            legacy,
          ),
          dispatchDate: optionalDate(
            context,
            period.versanddatum,
            [...path, 'versanddatum'],
            ['versanddatum'],
            legacy,
          ),
          heatingDefaults: defaults,
          totals,
          standardCostCategoryStatus,
          notes: period.hinweise
            ? {
                general: stringOrNullish(period.hinweise.allgemein),
                credit: stringOrNullish(period.hinweise.guthaben),
                additionalPayment: stringOrNullish(period.hinweise.nachzahlung),
              }
            : undefined,
          coverLetter: period.anschreiben
            ? {
                active:
                  optionalBoolean(
                    context,
                    period.anschreiben.aktiv,
                    [...path, 'anschreiben', 'aktiv'],
                    ['anschreiben', 'aktiv'],
                    legacy,
                  ) ?? false,
                text: stringOrNullish(period.anschreiben.text),
              }
            : undefined,
          lastModifiedAt: optionalTimestamp(
            context,
            period._ts,
            [...path, '_ts'],
            ['_ts'],
            legacy,
          ),
        },
        legacy,
      ),
    ]
  }
  for (const [userIndex, user] of (period.nutzer ?? []).entries())
    mapUser(
      state,
      context,
      user,
      [...path, 'nutzer', userIndex],
      period.id,
      property,
    )
  for (const [costIndex, cost] of (period.kostenarten ?? []).entries())
    mapCost(
      state,
      context,
      cost,
      [...path, 'kostenarten', costIndex],
      period.id,
      property,
    )
  mapHeating(state, context, period, path, property)
  mapAuditEvents(state, context, period, path)
  return year
}

function mapUser(
  state: MigrationState,
  context: MigrationContext,
  user: V3Nutzer,
  path: JsonPath,
  billingPeriodId: string,
  property: PropertyContext,
): void {
  const legacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    user,
    [
      'id',
      'nr',
      'aktiv',
      'leerstand',
      'name',
      'vorname',
      'nachname',
      'anrede',
      'nutzeinheit',
      'lage',
      'mandatsref',
      'firma_privat',
      'email',
      'eingezogen',
      'ausgezogen',
      'flaeche_nf',
      'flaeche_nf_hzg',
      'personen',
      'zimmer',
      'einheiten',
      'einheiten_geschaetzt',
      'einheiten_schatz_grund',
      'kuerzung12_anwenden',
      'kosten_scope',
      'grundsteuer_key',
      'vz_monat',
      'vz_gesamt',
      'keine_vz_vereinbart',
      'miete_monat',
      'versand_strasse',
      'versand_plz_ort',
      'versanddatum_nutzer',
      'bemerkung',
      'kaltwasser_m3',
      'wasser_m3',
      '_abrStatus',
    ],
    legacy,
    path,
  )
  if (user._abrStatus !== undefined)
    context.drop(
      [...path, '_abrStatus'],
      'Transienter UI-Berechnungsstatus',
      user._abrStatus,
    )
  const unitKey = `${property.propertyId}\u0000${user.nutzeinheit ?? ''}\u0000${user.lage ?? ''}`
  let unit = state.units.find(
    (candidate) =>
      `${candidate.propertyId}\u0000${candidate.label ?? ''}\u0000${candidate.location ?? ''}` ===
      unitKey,
  )
  const inferredBuildingId =
    buildingForUser(state, property, user.mandatsref) ??
    buildingForUser(state, property, user.kosten_scope) ??
    buildingForUser(state, property, user.grundsteuer_key)
  if (!unit) {
    unit = withLegacy(
      {
        id: context.id([...path, 'unit']),
        propertyId: property.propertyId,
        buildingId: inferredBuildingId,
        label: stringOrNullish(user.nutzeinheit),
        location: stringOrNullish(user.lage),
        usableAreaSqm: quantity(
          context,
          user.flaeche_nf,
          'm2',
          [...path, 'flaeche_nf'],
          ['flaeche_nf'],
          legacy,
        ),
        heatedAreaSqm: quantity(
          context,
          user.flaeche_nf_hzg,
          'm2',
          [...path, 'flaeche_nf_hzg'],
          ['flaeche_nf_hzg'],
          legacy,
        ),
        roomCount: optionalNonNegative(
          context,
          user.zimmer,
          [...path, 'zimmer'],
          ['zimmer'],
          legacy,
        ),
      },
      [],
    )
    state.units = [...state.units, unit]
  } else {
    const sourcePathSegment = path[path.length - 1]
    const sourceIndex =
      typeof sourcePathSegment === 'number' ? sourcePathSegment : 0
    const duplicateLegacy: LegacyUnmappedEntry[] = []
    const values = [
      {
        key: 'flaeche_nf',
        source: user.flaeche_nf,
        current: unit.usableAreaSqm,
        mapped: quantity(
          context,
          user.flaeche_nf,
          'm2',
          [...path, 'flaeche_nf'],
          ['deduplicatedUsers', sourceIndex, 'flaeche_nf'],
          duplicateLegacy,
        ),
      },
      {
        key: 'flaeche_nf_hzg',
        source: user.flaeche_nf_hzg,
        current: unit.heatedAreaSqm,
        mapped: quantity(
          context,
          user.flaeche_nf_hzg,
          'm2',
          [...path, 'flaeche_nf_hzg'],
          ['deduplicatedUsers', sourceIndex, 'flaeche_nf_hzg'],
          duplicateLegacy,
        ),
      },
      {
        key: 'zimmer',
        source: user.zimmer,
        current: unit.roomCount,
        mapped: optionalNonNegative(
          context,
          user.zimmer,
          [...path, 'zimmer'],
          ['deduplicatedUsers', sourceIndex, 'zimmer'],
          duplicateLegacy,
        ),
      },
    ] as const
    for (const value of values) {
      if (
        value.source !== undefined &&
        value.mapped !== undefined &&
        JSON.stringify(value.current) !== JSON.stringify(value.mapped)
      ) {
        context.issue(
          'warning',
          'migration.deduplicated_unit_value_conflict',
          'Ein abweichender Wert einer zusammengeführten Nutzungseinheit wurde konserviert',
          [...path, value.key],
        )
        addUnmapped(
          context,
          duplicateLegacy,
          ['deduplicatedUsers', sourceIndex, value.key],
          [...path, value.key],
          value.source,
        )
      }
    }
    if (duplicateLegacy.length > 0) {
      const updatedUnit = {
        ...unit,
        legacyUnmapped: [...(unit.legacyUnmapped ?? []), ...duplicateLegacy],
      }
      state.units = state.units.map((candidate) =>
        candidate.id === unit!.id ? updatedUnit : candidate,
      )
      unit = updatedUnit
    }
  }
  const vacancy = isVacancy(user)
  let tenancyId: string | undefined
  if (!vacancy) {
    const personId = context.id(['persons', property.propertyId, user.id])
    if (!state.persons.some(({ id }) => id === personId)) {
      let salutation: 'Herr' | 'Frau' | 'Familie' | 'Firma' | null | undefined
      const legacySalutation = user.anrede === '' ? null : user.anrede
      if (
        legacySalutation == null ||
        legacySalutation === 'Herr' ||
        legacySalutation === 'Frau' ||
        legacySalutation === 'Familie' ||
        legacySalutation === 'Firma'
      )
        salutation = legacySalutation
      else {
        context.issue(
          'warning',
          'migration.unknown_salutation',
          'Eine unbekannte Anrede wurde nicht übernommen',
          [...path, 'anrede'],
        )
        addUnmapped(
          context,
          legacy,
          ['anrede'],
          [...path, 'anrede'],
          user.anrede,
        )
      }
      state.persons = [
        ...state.persons,
        {
          id: personId,
          organizationId: property.organizationId,
          salutation,
          firstName: stringOrNullish(user.vorname),
          lastName: stringOrNullish(user.nachname),
          displayName: userDisplayName(user),
          companyOrPrivate: stringOrNullish(user.firma_privat),
          email: stringOrNullish(user.email),
        },
      ]
    }
    tenancyId = user.id
    if (!state.tenancies.some(({ id }) => id === tenancyId))
      state.tenancies = [
        ...state.tenancies,
        {
          id: tenancyId,
          unitId: unit.id,
          personIds: [personId],
          mandateReference: stringOrNullish(user.mandatsref),
          movedIn: optionalDate(
            context,
            user.eingezogen,
            [...path, 'eingezogen'],
            ['eingezogen'],
            legacy,
          ),
          movedOut: optionalDate(
            context,
            user.ausgezogen,
            [...path, 'ausgezogen'],
            ['ausgezogen'],
            legacy,
          ),
          monthlyRentCents: optionalCents(
            context,
            user.miete_monat,
            [...path, 'miete_monat'],
            ['miete_monat'],
            legacy,
          ),
          shippingAddressStreet: stringOrNullish(user.versand_strasse),
          shippingAddressPostalCodeAndCity: stringOrNullish(
            user.versand_plz_ort,
          ),
        },
      ]
  }
  const monthlyAmount = optionalCents(
    context,
    user.vz_monat,
    [...path, 'vz_monat'],
    ['vz_monat'],
    legacy,
  )
  const annualAmount = optionalCents(
    context,
    user.vz_gesamt,
    [...path, 'vz_gesamt'],
    ['vz_gesamt'],
    legacy,
  )
  const noneAgreed = optionalBoolean(
    context,
    user.keine_vz_vereinbart,
    [...path, 'keine_vz_vereinbart'],
    ['keine_vz_vereinbart'],
    legacy,
  )
  const occupancyId = context.id([...path, 'occupancy_period'])
  state.occupancyPeriods = [
    ...state.occupancyPeriods,
    withLegacy(
      {
        id: occupancyId,
        billingPeriodId,
        unitId: unit.id,
        tenancyId,
        kind: vacancy ? ('vacancy' as const) : ('tenant' as const),
        legacyActiveFlag: stringOrNullish(user.aktiv),
        displayOrder: optionalInteger(
          context,
          user.nr,
          [...path, 'nr'],
          ['nr'],
          legacy,
        ),
        from: optionalDate(
          context,
          user.eingezogen,
          [...path, 'eingezogen'],
          ['eingezogen'],
          legacy,
        ),
        to: optionalDate(
          context,
          user.ausgezogen,
          [...path, 'ausgezogen'],
          ['ausgezogen'],
          legacy,
        ),
        persons: quantity(
          context,
          user.personen,
          'personen',
          [...path, 'personen'],
          ['personen'],
          legacy,
        ),
        consumptionUnits: quantity(
          context,
          user.einheiten,
          'einheiten',
          [...path, 'einheiten'],
          ['einheiten'],
          legacy,
        ),
        consumptionUnitsEstimated: optionalBoolean(
          context,
          user.einheiten_geschaetzt,
          [...path, 'einheiten_geschaetzt'],
          ['einheiten_geschaetzt'],
          legacy,
        ),
        consumptionUnitsEstimateReason: stringOrNullish(
          user.einheiten_schatz_grund,
        ),
        applySection12Reduction: optionalBoolean(
          context,
          user.kuerzung12_anwenden,
          [...path, 'kuerzung12_anwenden'],
          ['kuerzung12_anwenden'],
          legacy,
        ),
        costScope: mapScope(user.kosten_scope, property.buildingIds),
        propertyTaxScope: mapScope(user.grundsteuer_key, property.buildingIds),
        coldWater: quantity(
          context,
          user.kaltwasser_m3,
          'm3',
          [...path, 'kaltwasser_m3'],
          ['kaltwasser_m3'],
          legacy,
        ),
        warmWater: quantity(
          context,
          user.wasser_m3,
          'm3',
          [...path, 'wasser_m3'],
          ['wasser_m3'],
          legacy,
        ),
        dispatchDate: optionalDate(
          context,
          user.versanddatum_nutzer,
          [...path, 'versanddatum_nutzer'],
          ['versanddatum_nutzer'],
          legacy,
        ),
        note: stringOrNullish(user.bemerkung),
      },
      legacy,
    ),
  ]
  if (typeof monthlyAmount === 'number') {
    state.prepayments = [
      ...state.prepayments,
      {
        id: context.id([...path, 'prepayment']),
        occupancyPeriodId: occupancyId,
        mode: 'monthly',
        monthlyAmountCents: monthlyAmount,
      },
    ]
  } else if (typeof annualAmount === 'number') {
    state.prepayments = [
      ...state.prepayments,
      {
        id: context.id([...path, 'prepayment']),
        occupancyPeriodId: occupancyId,
        mode: 'annual',
        annualAmountCents: annualAmount,
      },
    ]
  } else if (noneAgreed === true)
    state.prepayments = [
      ...state.prepayments,
      {
        id: context.id([...path, 'prepayment']),
        occupancyPeriodId: occupancyId,
        mode: 'none_agreed',
      },
    ]
  else
    context.issue(
      'info',
      'migration.prepayment_missing',
      'Für einen Nutzungszeitraum ist keine Vorauszahlungsart erfasst',
      path,
    )
}
