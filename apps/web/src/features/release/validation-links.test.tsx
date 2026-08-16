import type { ValidationIssue } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { validationIssueLink } from './validation-links'

function issue(
  area: ValidationIssue['area'],
  entity?: ValidationIssue['entity'],
): ValidationIssue {
  return {
    severity: 'error',
    code: 'test.issue',
    area,
    title: 'Testhinweis',
    entity,
  }
}

describe('validationIssueLink', () => {
  it.each([
    ['master_data', '#/objekte', 'Stammdaten bearbeiten'],
    ['billing_period', '#/abrechnungsjahre', 'Abrechnungsjahr bearbeiten'],
    ['occupancy', '#/nutzer', 'Nutzer bearbeiten'],
    ['prepayments', '#/nutzer', 'Nutzer bearbeiten'],
    ['costs', '#/kosten', 'Kosten bearbeiten'],
    ['bookings', '#/kosten', 'Kosten bearbeiten'],
    ['heating', '#/heizkreise', 'Heizung bearbeiten'],
    ['hot_water', '#/heizkreise', 'Heizung bearbeiten'],
    ['co2', '#/heizkreise', 'Heizung bearbeiten'],
    ['meters', '#/heizkreise', 'Zähler bearbeiten'],
    ['totals', '#/berechnung', 'Berechnung prüfen'],
    ['documents', '#/pdf-export', 'Dokumente bearbeiten'],
    ['migration', '#/sicherung', 'Datenbestand prüfen'],
    ['schema', '#/sicherung', 'Datenbestand prüfen'],
    ['other', '#/', 'Übersicht öffnen'],
  ] as const)(
    'ordnet %s dem passenden Arbeitsbereich zu',
    (area, href, label) => {
      expect(validationIssueLink(issue(area))).toEqual({ href, label })
    },
  )

  it('führt Firmenbefunde gezielt zur Firmenverwaltung', () => {
    expect(
      validationIssueLink(issue('master_data', { type: 'Company', id: 'c-1' })),
    ).toEqual({ href: '#/firmen', label: 'Firma bearbeiten' })
  })
})
