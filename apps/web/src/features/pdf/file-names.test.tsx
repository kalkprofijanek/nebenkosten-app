import { describe, expect, it } from 'vitest'
import {
  combinedStatementFileName,
  prepaymentAdjustmentFileName,
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

  it('benennt das VZ-Anpassungsschreiben passend zur Einzelabrechnung', () => {
    expect(
      prepaymentAdjustmentFileName(2025, 'WE 1 / EG', [
        'Erika Mustermann',
        null,
      ]),
    ).toBe('NK_2025_WE_1_EG_Erika_Mustermann_Vorauszahlungsanpassung.pdf')
    expect(prepaymentAdjustmentFileName(2025, 'WE 1', [])).toBe(
      'NK_2025_WE_1_Unbekannt_Vorauszahlungsanpassung.pdf',
    )
  })

  it('macht doppelte Namen eindeutig', () => {
    const used = new Set<string>()
    expect(uniqueFileName('NK_2025_WE_1.pdf', used)).toBe('NK_2025_WE_1.pdf')
    expect(uniqueFileName('nk_2025_we_1.pdf', used)).toBe('nk_2025_we_1_2.pdf')
  })
})
