import { describe, expect, it } from 'vitest'
import {
  combinedStatementFileName,
  reservedStatementFileNames,
  safeFileNamePart,
  tenantStatementFileName,
  uniqueFileName,
} from './file-names'

describe('PDF-Dateinamen', () => {
  it('ersetzt Sonderzeichen durch einen einzelnen Unterstrich', () => {
    expect(safeFileNamePart('El 1 II. OG li')).toBe('El_1_II_OG_li')
    expect(safeFileNamePart(' Müller / Söhne ')).toBe('Müller_Söhne')
  })

  it('benennt Einzel- und Gesamtabrechnungen einheitlich', () => {
    expect(
      tenantStatementFileName(2025, 'WE 1', ['Erika Mustermann', null]),
    ).toBe('NK_2025_WE_1_Erika_Mustermann.pdf')
    expect(tenantStatementFileName(2025, 'WE 1', [])).toBe(
      'NK_2025_WE_1_Unbekannt.pdf',
    )
    expect(combinedStatementFileName(2025, 'internal')).toBe(
      'NK_2025_Gesamtabrechnung_intern.pdf',
    )
    expect(combinedStatementFileName(2025, 'tenant')).toBe(
      'NK_2025_Gesamtabrechnung_Mieter.pdf',
    )
  })

  it('macht doppelte Namen eindeutig', () => {
    const used = new Set<string>()
    expect(uniqueFileName('NK_2025_WE_1.pdf', used)).toBe('NK_2025_WE_1.pdf')
    expect(uniqueFileName('nk_2025_we_1.pdf', used)).toBe('nk_2025_we_1_2.pdf')
  })

  it('kürzt sehr lange Namensteile auf 60 Zeichen', () => {
    const part = safeFileNamePart(`${'Ä'.repeat(80)} Rest`)
    expect(Array.from(part)).toHaveLength(60)
    expect(safeFileNamePart(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59))
  })

  it('reserviert die Namen der Gesamtabrechnungen für die Einzelabrechnungen', () => {
    const used = reservedStatementFileNames(2025)
    expect(
      uniqueFileName(
        tenantStatementFileName(2025, 'Gesamtabrechnung', ['intern']),
        used,
      ),
    ).toBe('NK_2025_Gesamtabrechnung_intern_2.pdf')
    expect(
      uniqueFileName(
        tenantStatementFileName(2025, 'gesamtabrechnung', ['MIETER']),
        used,
      ),
    ).toBe('NK_2025_gesamtabrechnung_MIETER_2.pdf')
    expect(
      uniqueFileName(tenantStatementFileName(2025, 'WE 1', ['A']), used),
    ).toBe('NK_2025_WE_1_A.pdf')
  })
})
