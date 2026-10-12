/**
 * Prüfung der Warmwasser-Verfahren nach §§ 8, 9 und 12 HeizKV (ADR-0010).
 * Die Altverfahren (Pauschalanteil, Personenschlüssel) bleiben rechenbar,
 * werden aber als nicht verordnungskonform gemeldet.
 */
import {
  isHeatPumpEnergySource,
  type CalculationOutput,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  HeatingCircuit,
  OccupancyPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import { periodOccupancies } from './helpers'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

function circuitEntity(circuit: HeatingCircuit) {
  return { type: 'HeatingCircuit', id: circuit.id }
}

/** Nutzungen im Gebäude des Heizkreises (Gebäudebereich vor Einheit). */
function circuitOccupancies(
  data: AppDataFile,
  period: BillingPeriod,
  circuit: HeatingCircuit,
): OccupancyPeriod[] {
  const unitBuilding = new Map(
    data.masterData.units.map(({ id, buildingId }) => [id, buildingId]),
  )
  return periodOccupancies(data, period.id).filter((occupancy) => {
    const buildingId =
      occupancy.costScope?.kind === 'building'
        ? occupancy.costScope.buildingId
        : unitBuilding.get(occupancy.unitId)
    return buildingId === circuit.buildingId
  })
}

/**
 * Statische Prüfung je Heizkreis mit zentraler Warmwasserbereitung:
 * (a) Pauschalanteil statt Wärmemenge nach § 9 Abs. 2,
 * (b) Personenschlüssel statt § 8 Abs. 1,
 * (c) Flächenformel bzw. Flächenschlüssel: keine verbrauchsabhängige
 *     Verteilung, Kürzungsrecht nach § 12 Abs. 1,
 * (d) Verbrauchsschlüssel ohne erfassten Warmwasserverbrauch,
 * (e) Volumenformel mit geschätzter Temperatur,
 * (f) Wärmepumpe ohne erzeugte Wärme (ADR-0010 „Wärmepumpen“).
 */
export function heatingComplianceIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId, hasCentralHotWater }) =>
      billingPeriodId === period.id && hasCentralHotWater,
  )
  for (const circuit of circuits) {
    const entity = circuitEntity(circuit)
    const energy = circuit.hotWaterEnergy
    const key = circuit.hotWaterAllocation?.key ?? 'persons'
    if (!energy)
      add(
        issue(
          'warning',
          'heating_compliance.hot_water_flat_share',
          'hot_water',
          '§ 9 Abs. 2 HeizKV: Warmwasseranteil ist pauschal angesetzt',
          {
            entity,
            path: ['hotWaterEnergy'],
            detail: `Der Warmwasseranteil wird mit pauschal ${circuit.hotWaterSharePercent ?? 18} % der Brennstoffkosten angesetzt. Die HeizKV verlangt die Wärmemenge der Warmwasserbereitung (Wärmezähler), ersatzweise die Volumenformel 2,5 × V × (tw − 10) oder, wenn beides nicht messbar ist, 32 kWh je m² Wohnfläche (§ 9 Abs. 2). Der Anteil gilt dann auch für Betriebsstrom und Wartung (§ 9 Abs. 1).`,
          },
        ),
      )
    if (key === 'persons')
      add(
        issue(
          'warning',
          'heating_compliance.hot_water_person_key',
          'hot_water',
          '§ 8 Abs. 1 HeizKV: Warmwasser wird nach Personen verteilt',
          {
            entity,
            path: ['hotWaterAllocation'],
            detail:
              'Die HeizKV sieht für Warmwasserkosten 50 bis 70 % nach erfasstem Warmwasserverbrauch und den Rest nach Wohn- oder Nutzfläche vor. Eine Verteilung nach Personenzahl ist dort nicht vorgesehen. Ohne Warmwasserzähler ist die Verteilung nach Fläche der nächstliegende Ersatz.',
          },
        ),
      )
    if (energy?.method === 'area_formula' || key === 'area')
      add(
        issue(
          'warning',
          'heating_compliance.hot_water_not_consumption_based',
          'hot_water',
          'Warmwasser wird nicht verbrauchsabhängig verteilt',
          {
            entity,
            path: [key === 'area' ? 'hotWaterAllocation' : 'hotWaterEnergy'],
            detail: `${energy?.method === 'area_formula' ? 'Die Wärmemenge wird nach der Flächenformel (32 kWh je m², § 9 Abs. 2 HeizKV) bestimmt. ' : ''}${key === 'area' ? 'Die Warmwasserkosten werden vollständig nach Fläche verteilt. ' : ''}Mangels Verbrauchserfassung können Mieter ihren Anteil an den betroffenen Kosten nach § 12 Abs. 1 HeizKV um 15 % kürzen. Ob die Kürzung von sich aus berücksichtigt wird, entscheidet der Vermieter.`,
          },
        ),
      )
    if (key === 'consumption') {
      const missing = circuitOccupancies(data, period, circuit).filter(
        (occupancy) =>
          occupancy.kind === 'tenant' && occupancy.warmWater == null,
      )
      for (const occupancy of missing)
        add(
          issue(
            'error',
            'heating_compliance.hot_water_consumption_missing',
            'hot_water',
            'Warmwasserverbrauch fehlt',
            {
              entity: { type: 'OccupancyPeriod', id: occupancy.id },
              path: ['warmWater'],
              detail:
                'Die Warmwasserkosten werden nach erfasstem Verbrauch verteilt (§ 8 Abs. 1 HeizKV), für diese Nutzung ist aber kein Warmwasserverbrauch in m³ erfasst.',
            },
          ),
        )
    }
    if (energy?.method === 'volume_formula' && energy.temperatureEstimated)
      add(
        issue(
          'info',
          'heating_compliance.hot_water_temperature_estimated',
          'hot_water',
          'Warmwassertemperatur ist geschätzt',
          {
            entity,
            path: ['hotWaterEnergy', 'temperatureC'],
            detail: `Die mittlere Warmwassertemperatur von ${energy.temperatureC.toLocaleString('de-DE')} °C für die Volumenformel 2,5 × V × (tw − 10) ist geschätzt (§ 9 Abs. 2 Satz 2 HeizKV). Die Schätzung sollte in der Abrechnung begründet werden.`,
          },
        ),
      )
    if (energy) heatPumpHeatOutputIssues(data, circuit, add)
  }
}

/**
 * Wärmepumpe im Heizkreis (ADR-0010 „Wärmepumpen“): Der Warmwasseranteil
 * s = Q ÷ Energieeinsatz wäre auf den Strom statt auf die erzeugte Wärme
 * bezogen und damit um die Jahresarbeitszahl zu hoch. Benötigt wird die
 * gemessene erzeugte Wärme oder die Jahresarbeitszahl je Wärmepumpenquelle.
 */
function heatPumpHeatOutputIssues(
  data: AppDataFile,
  circuit: HeatingCircuit,
  add: Add,
): void {
  if (circuit.generatedHeatKwh != null) return
  const buildingEnergySourceType = data.masterData.buildings.find(
    ({ id }) => id === circuit.buildingId,
  )?.defaultEnergySourceType
  const heatPumps = data.billingData.energySources.filter(
    (source) =>
      source.heatingCircuitId === circuit.id &&
      isHeatPumpEnergySource(source, buildingEnergySourceType),
  )
  if (heatPumps.length === 0) return
  const entity = circuitEntity(circuit)
  const withoutFactor = heatPumps.filter(
    ({ seasonalPerformanceFactor }) => seasonalPerformanceFactor == null,
  )
  const names = (sources: typeof heatPumps) =>
    sources.map((source) => `„${source.name ?? source.key}“`).join(', ')
  if (withoutFactor.length > 0) {
    add(
      issue(
        'error',
        'heating_compliance.heat_pump_heat_output_missing',
        'hot_water',
        'Warmwasseranteil wäre auf Strom statt auf erzeugte Wärme bezogen',
        {
          entity,
          path: ['generatedHeatKwh'],
          detail: `Der Heizkreis wird (auch) von einer Wärmepumpe versorgt (${names(withoutFactor)}). Die Wärmemenge der Warmwasserbereitung (§ 9 Abs. 2 HeizKV) wird sonst durch den Stromverbrauch geteilt; der Warmwasseranteil wäre dadurch etwa um die Jahresarbeitszahl zu hoch. Bitte die vom Wärmeerzeuger abgegebene Wärmemenge (Wärmemengenzähler) am Heizkreis oder die Jahresarbeitszahl der Wärmepumpe an der Energiequelle erfassen.`,
        },
      ),
    )
    return
  }
  // Geschätzte Jahresarbeitszahl: Pflichtbegründung, Warnung (Schätzung).
  const estimated = heatPumps.filter(
    ({ seasonalPerformanceFactorEstimated }) =>
      seasonalPerformanceFactorEstimated === true,
  )
  for (const source of estimated.filter(
    ({ seasonalPerformanceFactorReason }) =>
      !seasonalPerformanceFactorReason?.trim(),
  ))
    add(
      issue(
        'error',
        'heating_compliance.heat_pump_seasonal_performance_factor_reason_missing',
        'hot_water',
        'Begründung der geschätzten Jahresarbeitszahl fehlt',
        {
          entity: { type: 'EnergySource', id: source.id },
          path: ['seasonalPerformanceFactorReason'],
          detail: `Die Jahresarbeitszahl von ${names([source])} ist als geschätzt gekennzeichnet. Bitte die Grundlage der Schätzung angeben (z. B. Herstellerangabe, Planungswert).`,
        },
      ),
    )
  if (estimated.length > 0) {
    add(
      issue(
        'warning',
        'heating_compliance.heat_pump_seasonal_performance_factor_estimated',
        'hot_water',
        'Warmwasseranteil beruht auf einer geschätzten Jahresarbeitszahl',
        {
          entity,
          path: ['generatedHeatKwh'],
          detail: `Die vom Wärmeerzeuger abgegebene Wärme ist nicht gemessen; der Stromverbrauch der Wärmepumpe (${names(estimated)}) wird mit einer geschätzten Jahresarbeitszahl in erzeugte Wärme umgerechnet (${estimated
            .map(
              (source) =>
                `${source.seasonalPerformanceFactor?.toLocaleString('de-DE')}${source.seasonalPerformanceFactorReason ? `: ${source.seasonalPerformanceFactorReason}` : ''}`,
            )
            .join(
              '; ',
            )}). Die HeizKV regelt Wärmepumpen bei verbundenen Anlagen nicht; die Schätzung wird im PDF ausgewiesen. Ein Wärmemengenzähler am Erzeuger wird empfohlen.`,
        },
      ),
    )
    return
  }
  add(
    issue(
      'info',
      'heating_compliance.heat_pump_seasonal_performance_factor_estimate',
      'hot_water',
      'Erzeugte Wärme der Wärmepumpe ist über die Jahresarbeitszahl ermittelt',
      {
        entity,
        path: ['generatedHeatKwh'],
        detail: `Der Stromverbrauch der Wärmepumpe (${names(heatPumps)}) wird mit der Jahresarbeitszahl in erzeugte Wärme umgerechnet. Die Wärme des Abrechnungszeitraums ist damit nicht unmittelbar gemessen; ein Wärmemengenzähler am Erzeuger wird empfohlen.`,
      },
    ),
  )
}

/**
 * Prüfung anhand des Rechenergebnisses: Wärmemenge angegeben, aber
 * Energieeinsatz unbekannt (Ersatz durch Pauschalanteil) bzw. Q größer als
 * der Energieeinsatz (Anteil auf 100 % begrenzt).
 */
export function heatingComplianceOutputIssues(
  output: CalculationOutput,
  add: Add,
): void {
  for (const circuit of output.heating.trace.circuits) {
    const energy = circuit.warmWater.energy
    if (!energy) continue
    const entity = {
      type: 'HeatingCircuit',
      id: circuit.heatingCircuitId ?? circuit.buildingId,
    }
    if (energy.energyInputMissing)
      add(
        issue(
          'error',
          'heating_compliance.hot_water_energy_input_missing',
          'hot_water',
          'Energieeinsatz des Heizkreises unbekannt',
          {
            entity,
            detail:
              'Für den Warmwasseranteil nach § 9 Abs. 3 HeizKV wird der Energieeinsatz in kWh benötigt (Verbrauchsmenge × Heizwert). Ohne ihn wird ersatzweise der Pauschalanteil angesetzt. Bitte Mengen und Heizwert der Energiequellen erfassen.',
          },
        ),
      )
    if (energy.capped)
      add(
        issue(
          'warning',
          'heating_compliance.hot_water_share_capped',
          'hot_water',
          'Wärmemenge Warmwasser übersteigt den Energieeinsatz',
          {
            entity,
            detail:
              'Die Wärmemenge der Warmwasserbereitung ist größer als der Energieeinsatz des Heizkreises; der Anteil wurde auf 100 % begrenzt. Bitte Wärmemenge, Volumen oder Fläche sowie den Heizwert prüfen.',
          },
        ),
      )
  }
}
