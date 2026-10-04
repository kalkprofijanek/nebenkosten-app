import { describe, expect, it } from 'vitest'
import {
  ESTIMATED_CONSUMPTION_NOTE,
  additionalPaymentText,
  co2TenantShareLine,
  creditText,
  estimatedConsumptionNote,
  heatingSplitExplanation,
} from '../src/legal-texts'

describe('legal-texts', () => {
  it('berechnet den Grundkostenanteil als Gegenstück zum Verbrauchsanteil', () => {
    const text = heatingSplitExplanation(70)
    expect(text).toContain('zu 70 % nach erfasstem Verbrauch')
    expect(text).toContain('zu 30 % nach beheizter Fläche')
    expect(text).not.toContain('Warmwasser')
  })

  it('nennt Wärmemengenzähler, Wohnfläche und Warmwasser passend zur Konfiguration', () => {
    const text = heatingSplitExplanation(70, {
      baseAreaBasis: 'usable_area',
      captureMode: 'heat_meter',
      hasCentralHotWater: true,
    })
    expect(text).toContain('Wohnungs-Wärmemengenzähler')
    expect(text).toContain('nach Wohnfläche')
    expect(text).toContain('§ 9 HeizKV')
    expect(text).not.toContain('Heizkostenverteiler')
  })

  it('erläutert die reine Flächenverteilung nach § 9a Abs. 2 HeizKV', () => {
    const text = heatingSplitExplanation(0, {
      areaOnlySection9aPercent: 33.333,
    })
    expect(text).toContain('§ 9a Abs. 2 HeizKV')
    expect(text).toContain('Für 33,3 % der beheizten Fläche')
    expect(text).toContain('ausschließlich nach beheizter Fläche')
    expect(text).not.toContain('nach erfasstem Verbrauch')
  })

  it('formuliert die CO2-Mieteranteil-Zeile je nach Emissionsfreiheit', () => {
    expect(co2TenantShareLine(50, false)).toBe(
      'CO2-Kosten Mieteranteil 50 % (Stufenmodell § 5 CO2KostAufG)',
    )
    expect(co2TenantShareLine(0, true)).toBe(
      'CO2-Kosten: keine Kosten nach BEHG angefallen',
    )
  })

  it('gibt den Schätzgrund nach § 9a HeizKV aus', () => {
    expect(estimatedConsumptionNote(' Zähler defekt ')).toBe(
      '* Ihr Verbrauch wurde geschätzt (§ 9a HeizKV). Grund der Schätzung: Zähler defekt',
    )
    expect(ESTIMATED_CONSUMPTION_NOTE).toBe(
      '* Ihr Verbrauch wurde geschätzt (§ 9a HeizKV).',
    )
  })

  it('formuliert Zahlungsaufforderung und Guthabenhinweis', () => {
    expect(
      additionalPaymentText({
        amount: '10,00 €',
        dueDate: '14.02.2026',
        iban: null,
        reference: 'NK 2025 WE 1',
      }),
    ).toBe(
      'Bitte überweisen Sie den Nachzahlungsbetrag von 10,00 € bis zum 14.02.2026, Verwendungszweck „NK 2025 WE 1“.',
    )
    expect(creditText('5,00 €')).toContain('innerhalb von vier Wochen')
  })
})
