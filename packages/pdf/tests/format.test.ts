import { describe, expect, it } from 'vitest'
import {
  balanceLabel,
  formatAllocationKeyLabel,
  formatEuroCents,
  formatIsoDate,
  formatPercent,
} from '../src/format'

describe('format', () => {
  it('formatiert Cent-Beträge als deutsche Euro-Angabe', () => {
    expect(formatEuroCents(123456)).toBe('1.234,56 €')
    expect(formatEuroCents(-500)).toBe('-5,00 €')
    expect(formatEuroCents(0)).toBe('0,00 €')
  })

  it('formatiert Prozentwerte', () => {
    expect(formatPercent(70)).toBe('70 %')
    expect(formatPercent(12.5)).toBe('12,5 %')
  })

  it('formatiert ISO-Datumsangaben deutsch und fällt bei fehlendem/ungültigem Wert zurück', () => {
    expect(formatIsoDate('2026-03-15')).toBe('15.03.2026')
    expect(formatIsoDate(null)).toBe('–')
    expect(formatIsoDate(undefined)).toBe('–')
    expect(formatIsoDate('not-a-date')).toBe('–')
  })

  it('mappt Umlageschlüssel auf lesbare Labels und fällt sonst auf den Rohwert zurück', () => {
    expect(formatAllocationKeyLabel('usable_area')).toBe('nach Wohnfläche')
    expect(formatAllocationKeyLabel('direct')).toBe('direkt zugeordnet')
    expect(formatAllocationKeyLabel(null)).toBe('–')
    expect(formatAllocationKeyLabel('custom_key')).toBe('custom_key')
  })

  it('bestimmt Nachzahlung/Guthaben aus dem Vorzeichen', () => {
    expect(balanceLabel(100)).toBe('Nachzahlung')
    expect(balanceLabel(0)).toBe('Nachzahlung')
    expect(balanceLabel(-100)).toBe('Guthaben')
  })
})
