import { describe, expect, it } from 'vitest'
import {
  monthLabel,
  monthlyInformationMailBody,
  monthlyInformationMailto,
} from './dispatch-mail'

const input = {
  addresses: [
    ['a+b', 'example.invalid'].join('@'),
    ['c', 'example.invalid'].join('@'),
  ],
  salutationName: null,
  month: '2026-12',
  unitLabel: 'DG & Studio',
  fileName: 'Verbrauchsinformation_2026-12_DG-Studio.pdf',
}

describe('E-Mail-Entwurf', () => {
  it('kodiert Empfänger, Betreff und Text für mailto', () => {
    expect(monthLabel('2026-12')).toBe('Dezember 2026')
    const href = monthlyInformationMailto(input)
    expect(href).toMatch(
      /^mailto:a%2Bb@example\.invalid,c@example\.invalid\?subject=/u,
    )
    expect(href).not.toMatch(/[\s&]DG|bcc/iu)
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('subject')).toBe(
      'Verbrauchsinformation Dezember 2026 – DG & Studio',
    )
    expect(params.get('body')).toBe(monthlyInformationMailBody(input))
    expect(monthlyInformationMailBody(input)).toMatch(/^Guten Tag,\r\n\r\n/u)
  })
  it('unterschreibt mit dem Absender, wenn angegeben', () => {
    const body = monthlyInformationMailBody({
      addresses: [['mieter', 'example.invalid'].join('@')],
      salutationName: null,
      month: '2026-10',
      unitLabel: 'Wohnung 1',
      fileName: 'Verbrauchsinformation_2026-10_Wohnung-1.pdf',
      senderName: ' Fiktive Eigentümerin ',
    })
    expect(body).toMatch(/Mit freundlichen Grüßen\r\nFiktive Eigentümerin$/u)
  })
})
