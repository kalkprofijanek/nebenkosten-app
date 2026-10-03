import { describe, expect, it } from 'vitest'
import type { Content } from 'pdfmake/interfaces'
import {
  PREPAYMENT_ADJUSTMENT_TITLE,
  PREPAYMENT_RETURN_SLIP_ID,
  appendPrepaymentAdjustment,
  buildPrepaymentAdjustmentContent,
  monthlyCostCents,
  roundedUpMonthlyCents,
} from '../src/prepayment-adjustment'
import { buildTenantStatement } from '../src/tenant-statement'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

const adjustment = {
  previousMonthlyCents: 15_000,
  newMonthlyCents: 18_300,
  annualizedCostsCents: 219_540,
  validFrom: '2027-01-01',
}

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.entries(record)
      .filter(([key]) => key !== 'canvas')
      .flatMap(([, item]) => texts(item))
  }
  return []
}

function canvasCount(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((sum: number, item) => sum + canvasCount(item), 0)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      (Array.isArray(record.canvas) ? 1 : 0) +
      Object.values(record).reduce(
        (sum: number, item) => sum + canvasCount(item),
        0,
      )
    )
  }
  return 0
}

function letterAndSlip(content: Content[]) {
  const page = content[0] as { pageBreak: string; stack: Content[] }
  const slipIndex = page.stack.findIndex(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      item.id === PREPAYMENT_RETURN_SLIP_ID,
  )
  return {
    page,
    letter: page.stack.slice(0, slipIndex),
    slip: page.stack[slipIndex],
  }
}

describe('Anpassungsschreiben § 560 Abs. 4 BGB', () => {
  it('rechnet den Monatswert mit Aufrundung auf volle Euro', () => {
    expect(monthlyCostCents(219_540)).toBe(18_295)
    expect(roundedUpMonthlyCents(219_540)).toBe(18_300)
    expect(roundedUpMonthlyCents(240_000)).toBe(20_000)
  })

  it('enthält alle Pflichtangaben und beginnt auf einer neuen Seite', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    const content = buildPrepaymentAdjustmentContent(
      {
        ...context,
        calculation: {
          ...context.calculation,
          tenants: context.calculation.tenants.map((item) =>
            item.id === tenant.id ? { ...item, balanceCents: 12_345 } : item,
          ),
        },
      },
      adjustment,
    )
    const { page, letter } = letterAndSlip(content)
    expect(page.pageBreak).toBe('before')
    const allText = texts(content).join('\n')
    expect(allText).toContain(PREPAYMENT_ADJUSTMENT_TITLE)
    expect(allText).toContain(
      `Betriebs- und Heizkostenabrechnung für das Jahr ${context.billingPeriod.year}`,
    )
    expect(allText).toContain('Nachzahlung von 123,45 €')
    expect(allText).toContain('2.195,40 € : 12')
    expect(allText).toContain('182,95 €')
    expect(allText).toContain('aufgerundet auf volle Euro')
    expect(allText).toContain('Die neue Vorauszahlung gilt ab dem 01.01.2027')
    expect(allText).toContain('183,00 € statt 150,00 € monatlich')
    expect(allText).toContain('Grundmiete')
    expect(allText).toContain('Dauerauftrag')
    expect(allText).toContain('wird mit Zugang wirksam')
    expect(allText).toContain('Mit freundlichen Grüßen')
    expect(allText).toContain(context.ownerCompany.name)
    expect(allText).toContain(context.tenancy.shippingAddressStreet!)
    expect(allText).not.toContain('Abweichend vom rechnerischen Wert')
    // Absenderzeile und Grußformel ohne Unterschriftsfeld des Vermieters.
    const letterText = texts(letter).join('\n')
    expect(letterText).not.toMatch(/Unterschrift/u)
    expect(canvasCount(letter)).toBe(0)
  })

  it('hat einen Rücksendeabschnitt nur mit Unterschrift des Mieters', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const { slip } = letterAndSlip(
      buildPrepaymentAdjustmentContent(context, adjustment),
    )
    const slipText = texts(slip).join('\n')
    expect(slipText).toContain(
      'Kenntnisnahme und Zahlungsbestätigung – bitte unterschrieben zurücksenden',
    )
    expect(slipText).toContain(
      `für die Wohnung ${context.unit.label} auf 183,00 € ab dem 01.01.2027`,
    )
    expect(slipText).toContain('per Dauerauftrag (wird angepasst)')
    expect(slipText).toContain('per SEPA-Lastschrift')
    expect(slipText).toContain('Ort, Datum')
    expect(slipText).toContain('Unterschrift Mieter/in')
    expect(slipText).not.toMatch(/Vermieter/u)
    expect(slipText).toContain(
      'Die Anpassung wird auch ohne Rücksendung wirksam; die Rücksendung dient der Bestätigung.',
    )
  })

  it('weist einen abweichend festgesetzten Betrag aus', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const allText = texts(
      buildPrepaymentAdjustmentContent(context, {
        ...adjustment,
        newMonthlyCents: 19_000,
      }),
    ).join('\n')
    expect(allText).toContain(
      'Abweichend vom rechnerischen Wert setzen wir die neue Vorauszahlung auf 190,00 € fest.',
    )
  })

  it('lehnt ungültige Beträge und Termine ab', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    expect(() =>
      buildPrepaymentAdjustmentContent(context, {
        ...adjustment,
        newMonthlyCents: 1.5,
      }),
    ).toThrow(/ungültig/u)
    expect(() =>
      buildPrepaymentAdjustmentContent(context, {
        ...adjustment,
        validFrom: '2027-01-15',
      }),
    ).toThrow(/Ersten eines Monats/u)
    expect(() =>
      buildPrepaymentAdjustmentContent(
        {
          ...context,
          calculation: { ...context.calculation, tenants: [] },
        },
        adjustment,
      ),
    ).toThrow(/Kein Berechnungsergebnis/u)
  })

  it('hängt das Schreiben an die Einzelabrechnung an', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const statement = buildTenantStatement(context)
    const combined = appendPrepaymentAdjustment(statement, context, adjustment)
    const statementContent = statement.content as Content[]
    const combinedContent = combined.content as Content[]
    expect(combinedContent).toHaveLength(statementContent.length + 1)
    expect(combinedContent.slice(0, statementContent.length)).toEqual(
      statementContent,
    )
    expect(texts(combinedContent.at(-1)).join('\n')).toContain(
      PREPAYMENT_ADJUSTMENT_TITLE,
    )
    expect(combined.styles).toEqual(statement.styles)

    const single = appendPrepaymentAdjustment(
      { content: 'Deckblatt' },
      context,
      adjustment,
    )
    expect(single.content).toHaveLength(2)
    expect(single.styles).toHaveProperty('title')
  })
})
