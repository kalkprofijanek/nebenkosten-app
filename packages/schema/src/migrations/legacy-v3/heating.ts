import type {
  LegacyUnmappedEntry,
  V3Abrechnung,
  V3Brennstoff,
  V3Energiequelle,
  V3Heizkreis,
} from '../..'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { inferFuelUnit, mapQuantityUnit, quantity } from './mapping'
import type { PropertyContext } from './shared'
import { stringOrNullish, withLegacy } from './shared'
import type { MigrationState } from './state'
import { addUnmapped, preserveUnknownKeys } from './unknown-fields'
import {
  optionalBoolean,
  optionalCents,
  optionalDate,
  optionalNonNegative,
  optionalPercent,
} from './values'

function mapCo2(
  context: MigrationContext,
  source: V3Heizkreis['co2'],
  path: JsonPath,
  legacy: LegacyUnmappedEntry[],
) {
  if (!source) return undefined
  preserveUnknownKeys(
    context,
    source,
    [
      'modus',
      'co2_faktor_kg_kwh',
      'co2_preis_eur_t',
      'abgabe',
      'aufteilung_vermieter_proz',
      'kennwert_kg_m2a',
    ],
    legacy,
    path,
    ['co2'],
  )
  const mode =
    source.modus === 'manual' || source.modus === 'manuell' ? 'manual' : 'auto'
  if (
    source.modus != null &&
    !['auto', 'manual', 'manuell'].includes(source.modus)
  ) {
    context.issue(
      'warning',
      'migration.unknown_co2_mode',
      'Ein unbekannter CO2-Modus wurde als automatisch übernommen',
      [...path, 'modus'],
    )
    addUnmapped(
      context,
      legacy,
      ['co2', 'modus'],
      [...path, 'modus'],
      source.modus,
    )
  }
  const common = {
    mode,
    co2FactorKgPerKwh: optionalNonNegative(
      context,
      source.co2_faktor_kg_kwh,
      [...path, 'co2_faktor_kg_kwh'],
      ['co2', 'co2_faktor_kg_kwh'],
      legacy,
    ),
    co2PricePerTonCents: optionalCents(
      context,
      source.co2_preis_eur_t,
      [...path, 'co2_preis_eur_t'],
      ['co2', 'co2_preis_eur_t'],
      legacy,
    ),
  }
  return mode === 'manual'
    ? {
        ...common,
        mode: 'manual' as const,
        levyCents: optionalCents(
          context,
          source.abgabe,
          [...path, 'abgabe'],
          ['co2', 'abgabe'],
          legacy,
        ),
        landlordSharePercent: optionalPercent(
          context,
          source.aufteilung_vermieter_proz,
          [...path, 'aufteilung_vermieter_proz'],
          ['co2', 'aufteilung_vermieter_proz'],
          legacy,
        ),
        intensityKgPerSqmYear: optionalNonNegative(
          context,
          source.kennwert_kg_m2a,
          [...path, 'kennwert_kg_m2a'],
          ['co2', 'kennwert_kg_m2a'],
          legacy,
        ),
      }
    : { ...common, mode: 'auto' as const }
}

function mapFuelSource(
  state: MigrationState,
  context: MigrationContext,
  source: V3Brennstoff | V3Energiequelle,
  key: string,
  name: string | null | undefined,
  circuitId: string,
  billingPeriodId: string,
  path: JsonPath,
): void {
  const legacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    source,
    [
      'id',
      'name',
      'art',
      'heizwert_kwh',
      'co2_faktor_kg_kwh',
      'anfangsbestand_menge',
      'anfangsbestand_wert',
      'anfangsbestand_preis',
      'restbestand_menge',
      'lieferungen',
    ],
    legacy,
    path,
  )
  const sourceId = context.id([...path, 'energy_source'])
  state.energySources = [
    ...state.energySources,
    withLegacy(
      {
        id: sourceId,
        heatingCircuitId: circuitId,
        key,
        name,
        sourceType: stringOrNullish(source.art),
        calorificValueKwhPerUnit: optionalNonNegative(
          context,
          source.heizwert_kwh,
          [...path, 'heizwert_kwh'],
          ['heizwert_kwh'],
          legacy,
        ),
        co2FactorKgPerKwh:
          'co2_faktor_kg_kwh' in source
            ? optionalNonNegative(
                context,
                source.co2_faktor_kg_kwh,
                [...path, 'co2_faktor_kg_kwh'],
                ['co2_faktor_kg_kwh'],
                legacy,
              )
            : undefined,
      },
      legacy,
    ),
  ]
  const inferredUnit = inferFuelUnit(source.art)
  const hasStock = [
    source.anfangsbestand_menge,
    source.anfangsbestand_wert,
    source.anfangsbestand_preis,
    source.restbestand_menge,
  ].some((value) => value !== undefined)
  if (hasStock) {
    const stockLegacy: LegacyUnmappedEntry[] = []
    state.fuelStocks = [
      ...state.fuelStocks,
      withLegacy(
        {
          id: context.id([...path, 'fuel_stock']),
          energySourceId: sourceId,
          billingPeriodId,
          openingQuantity: quantity(
            context,
            source.anfangsbestand_menge,
            inferredUnit,
            [...path, 'anfangsbestand_menge'],
            ['anfangsbestand_menge'],
            stockLegacy,
          ),
          openingValueCents: optionalCents(
            context,
            source.anfangsbestand_wert,
            [...path, 'anfangsbestand_wert'],
            ['anfangsbestand_wert'],
            stockLegacy,
          ),
          openingPricePerUnitCents: optionalCents(
            context,
            source.anfangsbestand_preis,
            [...path, 'anfangsbestand_preis'],
            ['anfangsbestand_preis'],
            stockLegacy,
          ),
          remainingQuantity: quantity(
            context,
            source.restbestand_menge,
            inferredUnit,
            [...path, 'restbestand_menge'],
            ['restbestand_menge'],
            stockLegacy,
          ),
        },
        stockLegacy,
      ),
    ]
  }
  for (const [deliveryIndex, delivery] of (
    source.lieferungen ?? []
  ).entries()) {
    const deliveryPath = [...path, 'lieferungen', deliveryIndex]
    const deliveryLegacy: LegacyUnmappedEntry[] = []
    preserveUnknownKeys(
      context,
      delivery,
      [
        'datum',
        'menge',
        'mengeneinheit',
        'mengenstatus',
        'mengenhinweis',
        'betrag',
        'bezeichnung',
        'beleg',
        '_buchung',
        '_buchung_split',
        '_menge_manuell',
        '_extern_ok',
        '_extern_grund',
        '_stromzaehler_id',
        '_konvertiert_von_kostenart',
      ],
      deliveryLegacy,
      deliveryPath,
    )
    const explicitUnit = mapQuantityUnit(delivery.mengeneinheit)
    if (delivery.mengeneinheit != null && explicitUnit === undefined)
      addUnmapped(
        context,
        deliveryLegacy,
        ['mengeneinheit'],
        [...deliveryPath, 'mengeneinheit'],
        delivery.mengeneinheit,
      )
    state.fuelDeliveries = [
      ...state.fuelDeliveries,
      withLegacy(
        {
          id: context.id([...deliveryPath, 'fuel_delivery']),
          energySourceId: sourceId,
          billingPeriodId,
          date: optionalDate(
            context,
            delivery.datum,
            [...deliveryPath, 'datum'],
            ['datum'],
            deliveryLegacy,
          ),
          quantity: quantity(
            context,
            delivery.menge,
            explicitUnit,
            [...deliveryPath, 'menge'],
            ['menge'],
            deliveryLegacy,
          ),
          quantityStatus: stringOrNullish(delivery.mengenstatus),
          quantityNote: stringOrNullish(delivery.mengenhinweis),
          quantityManuallySet: optionalBoolean(
            context,
            delivery._menge_manuell,
            [...deliveryPath, '_menge_manuell'],
            ['_menge_manuell'],
            deliveryLegacy,
          ),
          amountCents: optionalCents(
            context,
            delivery.betrag,
            [...deliveryPath, 'betrag'],
            ['betrag'],
            deliveryLegacy,
          ),
          description: stringOrNullish(delivery.bezeichnung),
          receiptReference: stringOrNullish(delivery.beleg),
          bookingLink:
            typeof delivery._buchung === 'string' &&
            delivery._buchung.length > 0
              ? {
                  bankBookingId: delivery._buchung,
                  splitId: stringOrNullish(delivery._buchung_split),
                }
              : undefined,
          externalPayment:
            delivery._extern_ok !== undefined ||
            delivery._extern_grund !== undefined
              ? {
                  confirmed:
                    optionalBoolean(
                      context,
                      delivery._extern_ok,
                      [...deliveryPath, '_extern_ok'],
                      ['_extern_ok'],
                      deliveryLegacy,
                    ) ?? false,
                  reason: stringOrNullish(delivery._extern_grund),
                }
              : undefined,
          meterId: stringOrNullish(delivery._stromzaehler_id),
          convertedFromCostCategoryId: stringOrNullish(
            delivery._konvertiert_von_kostenart,
          ),
        },
        deliveryLegacy,
      ),
    ]
  }
}

export function mapHeating(
  state: MigrationState,
  context: MigrationContext,
  period: V3Abrechnung,
  path: JsonPath,
  property: PropertyContext,
): void {
  const circuits: {
    value: V3Heizkreis
    path: JsonPath
    co2Path: JsonPath
    fuelPath?: JsonPath
  }[] =
    period.heizkreise && period.heizkreise.length > 0
      ? period.heizkreise.map((value, index) => ({
          value,
          path: [...path, 'heizkreise', index],
          co2Path: [...path, 'heizkreise', index, 'co2'],
        }))
      : period.brennstoff
        ? [
            {
              value: {
                id: property.buildingIds.keys().next().value ?? 'B1',
                brennstoff: period.brennstoff,
                co2: period.co2,
                hat_warmwasser: false,
              },
              path,
              co2Path: [...path, 'co2'],
              fuelPath: [...path, 'brennstoff'],
            },
          ]
        : []
  if (
    (!period.heizkreise || period.heizkreise.length === 0) &&
    period.brennstoff
  )
    context.issue(
      'info',
      'migration.single_heating_fallback',
      'Ein älterer Einzel-Heizkreis wurde übernommen',
      [...path, 'brennstoff'],
    )
  for (const {
    value: circuit,
    path: circuitPath,
    co2Path,
    fuelPath,
  } of circuits) {
    const legacy: LegacyUnmappedEntry[] = []
    preserveUnknownKeys(
      context,
      circuit,
      [
        'id',
        'brennstoff',
        'energiequellen',
        'co2',
        'vorgaben',
        'hat_warmwasser',
        'ww_anteil_proz',
      ],
      legacy,
      circuitPath,
    )
    if (circuit.vorgaben)
      preserveUnknownKeys(
        context,
        circuit.vorgaben,
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
        [...circuitPath, 'vorgaben'],
        ['vorgaben'],
      )
    const buildingId = property.buildingIds.get(circuit.id)
    if (!buildingId) {
      context.issue(
        'error',
        'migration.heating_building_missing',
        'Ein Heizkreis verweist auf keinen Gebäudeblock',
        [...circuitPath, 'id'],
      )
      continue
    }
    const circuitId = context.id([...circuitPath, 'heating_circuit'])
    state.heatingCircuits = [
      ...state.heatingCircuits,
      withLegacy(
        {
          id: circuitId,
          billingPeriodId: period.id,
          heatingSystemId: property.heatingSystemId,
          buildingId,
          co2: mapCo2(context, circuit.co2 ?? period.co2, co2Path, legacy),
          overrides: circuit.vorgaben
            ? {
                consumptionSharePercent: optionalPercent(
                  context,
                  circuit.vorgaben.verbrauch_proz,
                  [...circuitPath, 'vorgaben', 'verbrauch_proz'],
                  ['vorgaben', 'verbrauch_proz'],
                  legacy,
                ),
                baseSharePercent: optionalPercent(
                  context,
                  circuit.vorgaben.grund_proz,
                  [...circuitPath, 'vorgaben', 'grund_proz'],
                  ['vorgaben', 'grund_proz'],
                  legacy,
                ),
                operatingElectricitySharePercent: optionalPercent(
                  context,
                  circuit.vorgaben.betriebsstrom_proz,
                  [...circuitPath, 'vorgaben', 'betriebsstrom_proz'],
                  ['vorgaben', 'betriebsstrom_proz'],
                  legacy,
                ),
              }
            : undefined,
          hasCentralHotWater:
            optionalBoolean(
              context,
              circuit.hat_warmwasser,
              [...circuitPath, 'hat_warmwasser'],
              ['hat_warmwasser'],
              legacy,
            ) ?? false,
          hotWaterSharePercent: optionalPercent(
            context,
            circuit.ww_anteil_proz,
            [...circuitPath, 'ww_anteil_proz'],
            ['ww_anteil_proz'],
            legacy,
          ),
        },
        legacy,
      ),
    ]
    if (circuit.energiequellen && circuit.energiequellen.length > 0)
      for (const [sourceIndex, source] of circuit.energiequellen.entries())
        mapFuelSource(
          state,
          context,
          source,
          source.id,
          stringOrNullish(source.name),
          circuitId,
          period.id,
          [...circuitPath, 'energiequellen', sourceIndex],
        )
    else if (circuit.brennstoff)
      mapFuelSource(
        state,
        context,
        circuit.brennstoff,
        'haupt',
        stringOrNullish(circuit.brennstoff.art),
        circuitId,
        period.id,
        fuelPath ?? [...circuitPath, 'brennstoff'],
      )
  }
}
