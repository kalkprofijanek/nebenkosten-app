import { describe, expect, it } from 'vitest'
import type { ContentTable, TableCell } from 'pdfmake/interfaces'
import type { CalculationOutput } from '@nebenkosten/core'
import {
  betrkvCell,
  buildCombinedCostStatement,
} from '../src/combined-cost-statement'
import { ROUNDING_DIFFERENCE_NOTICE } from '../src/legal-texts'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  SUMMARY_ROUNDING_LABEL,
  SUMMARY_ROUNDING_NOTICE,
  summaryRoundingCents,
  summaryWithRounding,
} from '../src/tenant-statement-summary'
import {
  buildFixtureAppData,
  buildFixtureCombinedContext,
  buildFixtureTenantStatementContext,
} from './fixture'

const text = (value: unknown) =>
  JSON.stringify(value).replace(
    new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
    ' ',
  )

const cellText = (cell: TableCell | undefined): string =>
  typeof cell === 'string'
    ? cell
    : cell && typeof cell === 'object' && 'text' in cell
      ? String(cell.text)
      : ''

function withShareOffset(
  calculation: CalculationOutput,
  occupancyId: string,
  offsetCents: number,
): CalculationOutput {
  return {
    ...calculation,
    tenants: calculation.tenants.map((tenant) =>
      tenant.id === occupancyId
        ? {
            ...tenant,
            shareCents: tenant.shareCents + offsetCents,
            balanceCents: tenant.balanceCents + offsetCents,
          }
        : tenant,
    ),
  }
}

describe('Übersicht der Einzelabrechnung: sichtbare Rundungszeile (A11)', () => {
  it('ergänzt ohne Differenz keine Zeile und behält den allgemeinen Hinweis', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    expect(summaryRoundingCents(tenant)).toBe(0)
    const [table, notice] = summaryWithRounding(context)
    expect(text(table)).not.toContain(SUMMARY_ROUNDING_LABEL)
    expect(text(notice)).toContain(ROUNDING_DIFFERENCE_NOTICE)
  })

  it('weist eine Differenz als eigene Zeile vor dem Anteil aus, sodass die Zeilen aufgehen', () => {
    const base = buildFixtureTenantStatementContext(buildFixtureAppData())
    const context = {
      ...base,
      calculation: withShareOffset(
        base.calculation,
        base.occupancyPeriod.id,
        -2,
      ),
    }
    const [table, notice] = summaryWithRounding(context)
    const body = (table as ContentTable).table.body
    const labels = body.map((row) => cellText(row[0]))
    const roundingIndex = labels.indexOf(SUMMARY_ROUNDING_LABEL)
    const shareIndex = labels.indexOf('Ihr Anteil an den Gesamtkosten')
    expect(roundingIndex).toBeGreaterThan(0)
    expect(roundingIndex).toBe(shareIndex - 1)
    expect(text(body[roundingIndex])).toContain('-0,02 €')
    expect(text(notice)).toContain(SUMMARY_ROUNDING_NOTICE)
    // Summe der gedruckten Zeilen vor dem Anteil = Anteil
    const cents = (cell: TableCell | undefined) =>
      Math.round(
        Number(
          cellText(cell)
            .replace(/[^\d,-]/gu, '')
            .replace(',', '.'),
        ) * 100,
      )
    const printed = body
      .slice(0, shareIndex)
      .reduce((sum, row) => sum + cents(row[1]), 0)
    expect(printed).toBe(cents(body[shareIndex]![1]))
  })

  it('verwendet die Rundungszeile im vollständigen Dokument', () => {
    const base = buildFixtureTenantStatementContext(buildFixtureAppData())
    const doc = buildTenantStatement({
      ...base,
      calculation: withShareOffset(
        base.calculation,
        base.occupancyPeriod.id,
        1,
      ),
    })
    expect(text(doc.content)).toContain(SUMMARY_ROUNDING_LABEL)
    expect(text(doc.content)).toContain('0,01 €')
  })
})

describe('Gesamtabrechnung: Klartext, Leerstand und Rundung (A9, A11)', () => {
  it('zeigt statt des internen Codes „nicht umlagefähig“', () => {
    expect(betrkvCell('NICHT_UML')).toMatchObject({
      text: 'nicht umlagefähig',
    })
    expect(betrkvCell('§2 Nr. 1')).toMatchObject({ text: '§2 Nr. 1' })
    expect(betrkvCell(null)).toMatchObject({ text: '–' })
    const appData = buildFixtureAppData()
    appData.billingData.costCategories[0]!.betrkvCategory = 'NICHT_UML'
    for (const audience of ['internal', 'tenant'] as const) {
      const serialized = text(
        buildCombinedCostStatement(
          buildFixtureCombinedContext(appData, audience),
        ).content,
      )
      expect(serialized).not.toContain('NICHT_UML')
      expect(serialized).toContain('nicht umlagefähig')
    }
  })

  it('weist keine Rundungszeile von 0,00 € und keine „Summe der Zeilen“ aus', () => {
    const serialized = text(
      buildCombinedCostStatement(
        buildFixtureCombinedContext(buildFixtureAppData(), 'tenant'),
      ).content,
    )
    expect(serialized).not.toContain('Summe der Zeilen')
    expect(serialized).not.toContain('± Rundung')
    expect(serialized).toContain('= auf die Mieter verteilt')
  })

  it('zeigt eine echte Rundungsdifferenz der Mieteranteile als eigene Zeile', () => {
    const base = buildFixtureCombinedContext(buildFixtureAppData(), 'tenant')
    const tenant = base.calculation.tenants.find(({ isVacancy }) => !isVacancy)!
    const serialized = text(
      buildCombinedCostStatement({
        ...base,
        calculation: withShareOffset(base.calculation, tenant.id, 1),
      }).content,
    )
    expect(serialized).toContain('± Rundungsausgleich')
  })

  it('stellt den Leerstand mit Zeitraum, Fläche und getrennten Heizkosten zusammenhängend dar', () => {
    const context = buildFixtureCombinedContext(
      buildFixtureAppData('case-03-vacancy'),
      'tenant',
    )
    expect(context.calculation.vacancyLandlordCents).not.toBe(0)
    const doc = buildCombinedCostStatement(context)
    const block = (doc.content as unknown as Record<string, unknown>[]).find(
      (item) =>
        Array.isArray(item.stack) &&
        text(item.stack).includes('"Leerstandsanteil"'),
    )
    expect(block?.unbreakable).toBe(true)
    const serialized = text(block)
    expect(serialized).toContain('Tage)')
    expect(serialized).toContain(' m² ')
    expect(serialized).toContain('Leerstandsanteil gesamt (Vermieter)')
    expect(serialized).not.toContain('Heiz- und CO2-Kosten sowie Rundung')
  })

  it('trennt Rundung und nicht erfasste Leerstandszeiten', () => {
    const base = buildFixtureCombinedContext(
      buildFixtureAppData('case-03-vacancy'),
      'tenant',
    )
    const withVacancy = (offset: number) =>
      text(
        buildCombinedCostStatement({
          ...base,
          calculation: {
            ...base.calculation,
            vacancyLandlordCents:
              base.calculation.vacancyLandlordCents + offset,
          },
        }).content,
      )
    expect(withVacancy(1)).toContain('Rundungsausgleich (Zeilen einzeln')
    expect(withVacancy(50_000)).toContain(
      'nicht als Nutzung erfasster Leerstandszeiten',
    )
  })

  it('nennt Verbrauchssumme und Personenjahre der Verteilung', () => {
    const appData = buildFixtureAppData('case-10-central-hot-water')
    const tenantVersion = text(
      buildCombinedCostStatement(buildFixtureCombinedContext(appData, 'tenant'))
        .content,
    )
    expect(tenantVersion).toContain('Verteilungsgrundlagen')
    expect(tenantVersion).toContain(
      'Verbrauch aller Nutzungen für die Verbrauchskosten',
    )
    expect(tenantVersion).toContain('Personenjahre für die Warmwasserkosten')
    expect(tenantVersion).not.toContain('"Personenjahre"')
    const internal = text(
      buildCombinedCostStatement(
        buildFixtureCombinedContext(appData, 'internal'),
      ).content,
    )
    // Interne Fassung: Werte je Nutzung
    expect(internal).toContain('"Personenjahre"')
  })
})
