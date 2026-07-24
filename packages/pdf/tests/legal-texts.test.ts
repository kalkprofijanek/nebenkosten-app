import { describe, expect, it } from 'vitest'
import { co2TenantShareLine, heatingSplitExplanation } from '../src/legal-texts'

describe('legal-texts', () => {
  it('berechnet den Grundkostenanteil als Gegenstück zum Verbrauchsanteil', () => {
    const text = heatingSplitExplanation(70)
    expect(text).toContain('zu 70 % nach erfasstem Verbrauch')
    expect(text).toContain('zu 30 % nach Nutzfläche')
  })

  it('formuliert die CO2-Mieteranteil-Zeile je nach Emissionsfreiheit', () => {
    expect(co2TenantShareLine(50, false)).toBe(
      'CO2-Kosten Mieteranteil 50 % (CO2KostAufG §5)',
    )
    expect(co2TenantShareLine(0, true)).toBe(
      'CO2-Kosten 0 % Mieteranteil — emissionsarme Heizung',
    )
  })
})
