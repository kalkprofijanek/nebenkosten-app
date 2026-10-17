import { tenantChanges } from '@nebenkosten/core'
import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'

/**
 * Prüfliste „Neue Angaben nach Import einer Altdatei“ (PR-35): Felder, die
 * das Altformat nicht kannte und die für eine HeizKV-konforme Abrechnung zu
 * ergänzen sind. Reine Anzeige; es wird nichts geändert.
 */
export interface ImportChecklistItem {
  readonly key: string
  /** Gebäude/Heizkreis oder `null` für Angaben des Abrechnungsjahres. */
  readonly scope: string | null
  readonly title: string
  readonly detail: string
  readonly href: string
}

export function importChecklist(
  data: AppDataFile,
  period: BillingPeriod,
): ImportChecklistItem[] {
  const items: ImportChecklistItem[] = []
  if (!period.climateFactor)
    items.push({
      key: 'climate-factor',
      scope: null,
      title: 'Klimafaktor des Abrechnungsjahres fehlt',
      detail:
        'Ohne DWD-Klimafaktor ist der witterungsbereinigte Vorjahresvergleich nach § 6a Abs. 3 HeizKV nicht möglich.',
      href: '#/abrechnungsjahre',
    })

  const buildingName = (id: string) =>
    data.masterData.buildings.find((building) => building.id === id)?.name ?? id
  const unitBuilding = new Map(
    data.masterData.units.map((unit) => [unit.id, unit.buildingId]),
  )
  const occupancies = new Map(
    data.billingData.occupancyPeriods.map((item) => [item.id, item]),
  )
  let changes: ReturnType<typeof tenantChanges>
  try {
    changes = tenantChanges(data, period)
  } catch {
    changes = []
  }

  for (const circuit of data.billingData.heatingCircuits) {
    if (circuit.billingPeriodId !== period.id) continue
    const scope = buildingName(circuit.buildingId)
    if (circuit.hasCentralHotWater && !circuit.hotWaterEnergy)
      items.push({
        key: `hot-water:${circuit.id}`,
        scope,
        title: 'Wärmemenge für Warmwasser fehlt',
        detail:
          'Zentrales Warmwasser ohne Angabe nach § 9 Abs. 2 HeizKV (Wärmezähler, Volumen- oder Flächenformel); es gilt der Pauschalanteil.',
        href: '#/heizkreise',
      })
    if (!circuit.consumptionBenchmark)
      items.push({
        key: `benchmark:${circuit.id}`,
        scope,
        title: 'Vergleichswerte fehlen',
        detail:
          'Für den Vergleich mit dem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV) sind keine Vergleichswerte hinterlegt.',
        href: '#/heizkreise',
      })
    const sources = new Set(
      data.billingData.energySources
        .filter(({ heatingCircuitId }) => heatingCircuitId === circuit.id)
        .map(({ id }) => id),
    )
    const untaxed = data.billingData.fuelDeliveries.filter(
      (delivery) =>
        delivery.billingPeriodId === period.id &&
        sources.has(delivery.energySourceId) &&
        !delivery.taxesAndLevies,
    ).length
    if (untaxed > 0)
      items.push({
        key: `taxes:${circuit.id}`,
        scope,
        title: `Steuern und Abgaben fehlen bei ${untaxed} ${untaxed === 1 ? 'Lieferung' : 'Lieferungen'}`,
        detail:
          'Für die Angaben nach § 6a Abs. 3 HeizKV (enthaltene Steuern, Abgaben und Zölle) fehlen die Beträge aus der Rechnung.',
        href: '#/heizkreise?tab=fuel',
      })
    const open = changes.filter((change) => {
      if (change.hasInterimReading) return false
      const next = occupancies.get(change.nextOccupancyId)
      const previous = occupancies.get(change.previousOccupancyId)
      const building =
        next?.costScope?.kind === 'building'
          ? next.costScope.buildingId
          : unitBuilding.get(change.unitId)
      return (
        building === circuit.buildingId &&
        !next?.section9bAllocation &&
        !previous?.section9bAllocation
      )
    })
    if (open.length > 0)
      items.push({
        key: `section9b:${circuit.id}`,
        scope,
        title: `§ 9b Abs. 3: Verteilung bei ${open.length} Nutzerwechsel${open.length === 1 ? '' : 'n'} ohne Zwischenablesung offen`,
        detail:
          'Bitte festlegen, ob nach Gradtagszahlen oder zeitanteilig aufgeteilt wird.',
        href: `#/verbrauch?occupancy=${encodeURIComponent(open[0]!.nextOccupancyId)}`,
      })
  }
  return items
}
