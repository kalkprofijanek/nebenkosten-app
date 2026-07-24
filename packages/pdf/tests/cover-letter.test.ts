import { describe, expect, it } from 'vitest'
import {
  renderCoverLetter,
  type CoverLetterPlaceholders,
} from '../src/cover-letter'

const values: CoverLetterPlaceholders = {
  anrede: 'Sehr geehrte Frau Müller',
  name: 'Anna Müller',
  nutzeinheit: 'WE 1',
  jahr: '2025',
  objekt: 'Musterweg',
  saldo: '123,45 €',
  saldo_art: 'Nachzahlung',
  datum: '15.01.2026',
  frist: '15.02.2026',
}

describe('renderCoverLetter', () => {
  it('ersetzt bekannte Platzhalter', () => {
    const result = renderCoverLetter(
      '{{anrede}}, Ihre Abrechnung {{jahr}} für {{nutzeinheit}} beträgt {{saldo}} ({{saldo_art}}).',
      values,
    )
    expect(result).toBe(
      'Sehr geehrte Frau Müller, Ihre Abrechnung 2025 für WE 1 beträgt 123,45 € (Nachzahlung).',
    )
  })

  it('lässt unbekannte Platzhalter unverändert stehen', () => {
    expect(renderCoverLetter('Hallo {{unbekannt}}', values)).toBe(
      'Hallo {{unbekannt}}',
    )
  })

  it('funktioniert ohne jeden Platzhalter', () => {
    expect(renderCoverLetter('Ein fester Text ohne Platzhalter.', values)).toBe(
      'Ein fester Text ohne Platzhalter.',
    )
  })
})
