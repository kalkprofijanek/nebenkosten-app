/**
 * Steuern und Abgaben in den Energiekosten (§ 6a Abs. 3 Nr. 1 b HeizKV,
 * ADR-0011): Tabelle „Gebäude gesamt / Ihr Anteil“ aus den an den
 * Lieferungen erfassten Angaben, sonst ein Hinweis mit dem CO₂-Betrag.
 */
import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  circuitTaxesAndLevies,
  tenantTaxesAndLevies,
  type CircuitTaxesAndLevies,
  type HeatingCircuitTrace,
  type TaxesAndLeviesAmounts,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import { formatEuroCents, formatNumber } from './format'
import { heatingTotalCents, tenantResult } from './tenant-statement-data'
import { MUTED } from './tenant-statement-tables'

export const TAXES_AND_LEVIES_HEADING =
  'In den Energiekosten enthaltene Steuern und Abgaben (§ 6a Abs. 3 Nr. 1 b HeizKV)'

/** Hinweis ohne erfasste Angaben; nennt die CO₂-Kosten des Heizkreises. */
export function energyTaxesFallbackText(co2CostCents: number): string {
  return co2CostCents > 0
    ? `In den Brennstoff- und Energiekosten sind die gesetzlichen Steuern und Abgaben (Umsatzsteuer, Energie- bzw. Stromsteuer) sowie CO2-Kosten nach BEHG von ${formatEuroCents(co2CostCents)} (Gebäude gesamt) enthalten.`
    : 'In den Brennstoff- und Energiekosten sind die gesetzlichen Steuern und Abgaben (Umsatzsteuer, Energie- bzw. Stromsteuer) enthalten; CO2-Kosten nach BEHG sind nicht angefallen.'
}

export interface EnergyTaxesInformation {
  /** Tabelle (leer, wenn keine Angaben erfasst sind). */
  readonly content: Content[]
  /** Hinweistext für den Fußtext (leer, wenn die Tabelle ausgegeben wird). */
  readonly notice: string
}

interface Row {
  readonly label: string
  readonly building: number
  readonly tenant: number
}

function vatLabel(ratePercent: number | null): string {
  return ratePercent === null
    ? 'Umsatzsteuer'
    : `Umsatzsteuer ${formatNumber(ratePercent, ratePercent % 1 === 0 ? 0 : 1)} %`
}

function rowsOf(
  building: TaxesAndLeviesAmounts,
  tenant: TaxesAndLeviesAmounts,
  co2Source: CircuitTaxesAndLevies['co2LevySource'],
): Row[] {
  const rows: Row[] = building.vat.map(({ ratePercent, cents }, index) => ({
    label: vatLabel(ratePercent),
    building: cents,
    tenant: tenant.vat[index]?.cents ?? 0,
  }))
  rows.push({
    label: 'Energiesteuer bzw. Stromsteuer',
    building: building.energyTaxCents,
    tenant: tenant.energyTaxCents,
  })
  rows.push({
    label:
      co2Source === 'invoice'
        ? 'CO2-Kosten nach BEHG'
        : 'CO2-Kosten nach BEHG (berechnet)',
    building: building.co2LevyCents,
    tenant: tenant.co2LevyCents,
  })
  building.otherLevies.forEach(({ label, cents }, index) =>
    rows.push({
      label: label ?? 'Sonstige Abgaben und Umlagen',
      building: cents,
      tenant: tenant.otherLevies[index]?.cents ?? 0,
    }),
  )
  return rows.filter(({ building: cents }) => cents !== 0)
}

function table(
  building: CircuitTaxesAndLevies,
  tenant: TaxesAndLeviesAmounts,
): Content[] {
  const amount = (cents: number, bold = false): TableCell => ({
    text: formatEuroCents(cents),
    alignment: 'right',
    noWrap: true,
    bold,
  })
  const body: TableCell[][] = [
    [
      { text: 'Art', style: 'th' },
      { text: 'Gebäude gesamt', style: 'th', alignment: 'right' },
      { text: 'Ihr Anteil', style: 'th', alignment: 'right' },
    ],
    ...rowsOf(building, tenant, building.co2LevySource).map(
      ({ label, building: total, tenant: own }): TableCell[] => [
        label,
        amount(total),
        amount(own),
      ],
    ),
    [
      { text: 'Summe Steuern und Abgaben', bold: true },
      amount(building.totalCents, true),
      amount(tenant.totalCents, true),
    ],
  ]
  const notes = [
    'Die Beträge sind in den Brennstoff- und Energiekosten enthalten und werden nicht zusätzlich berechnet; Grundlage sind die Energierechnungen, anteilig zum verbrauchten Brennstoff.',
    'Ihr Anteil an Umsatzsteuer, Energiesteuer und sonstigen Abgaben entspricht Ihrem Anteil an den Heiz- und Warmwasserkosten, an den CO2-Kosten Ihrem Anteil nach dem CO2-Kostenaufteilungsgesetz.',
  ]
  if (building.co2LevySource === 'calculated' && building.co2LevyCents > 0)
    notes.push(
      'Die CO2-Kosten sind nicht für den gesamten Brennstoff auf den Rechnungen ausgewiesen; angegeben sind die berechneten CO2-Kosten.',
    )
  if (building.notStatedValueCents > 0)
    notes.push(
      `Für verbrauchten Brennstoff im Wert von ${formatEuroCents(building.notStatedValueCents)} (z. B. Anfangsbestand aus dem Vorjahr) liegen keine Angaben zu Steuern und Abgaben vor; sie sind darin enthalten, aber nicht ausgewiesen.`,
    )
  return [
    { text: TAXES_AND_LEVIES_HEADING, style: 'th', margin: [0, 4, 0, 2] },
    {
      table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 2],
    },
    {
      text: notes.join(' '),
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 4],
    },
  ]
}

/**
 * Steuern und Abgaben für die Einzelabrechnung: Tabelle bei erfassten
 * Angaben, sonst Hinweistext mit dem konkreten CO₂-Betrag.
 */
export function energyTaxesInformation(
  context: TenantStatementContext,
  circuit: Readonly<HeatingCircuitTrace>,
): EnergyTaxesInformation {
  const deliveries = context.appData.billingData.fuelDeliveries.filter(
    ({ billingPeriodId }) => billingPeriodId === context.billingPeriod.id,
  )
  const building = circuitTaxesAndLevies(circuit, deliveries)
  if (!building)
    return {
      content: [],
      notice: `${energyTaxesFallbackText(circuit.co2.totalCents)} `,
    }
  const tenant = tenantResult(context)
  const own = tenantTaxesAndLevies(circuit, building, {
    tenantHeatingCents: heatingTotalCents(tenant),
    tenantCo2Cents: tenant.costBreakdown.heatingCo2Cents,
  })
  return { content: table(building, own), notice: '' }
}
