/**
 * Prüfung der Warmwasser-Verfahren nach §§ 8, 9 und 12 HeizKV (ADR-0010).
 * Die Altverfahren (Pauschalanteil, Personenschlüssel) bleiben rechenbar,
 * werden aber als nicht verordnungskonform gemeldet.
 */
import type { CalculationOutput } from '@nebenkosten/core'
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
 * (e) Volumenformel mit geschätzter Temperatur.
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
  }
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
