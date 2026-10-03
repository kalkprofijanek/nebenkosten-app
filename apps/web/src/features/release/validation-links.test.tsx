import type { ValidationIssue } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { validationIssueLink } from './validation-links'

function issue(
  area: ValidationIssue['area'],
  entity?: ValidationIssue['entity'],
  code = 'test.issue',
): ValidationIssue {
  return {
    severity: 'error',
    code,
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
    ['meters', '#/heizkreise?tab=meters', 'Zähler bearbeiten'],
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

  it('führt Brennstoffbefunde und fehlende Lieferungen zur Brennstofferfassung', () => {
    expect(
      validationIssueLink(
        issue('heating', { type: 'FuelDelivery', id: 'f-1' }),
      ),
    ).toEqual({ href: '#/heizkreise?tab=fuel', label: 'Lieferung bearbeiten' })
    expect(
      validationIssueLink(
        issue('heating', undefined, 'heating.delivery_missing'),
      ),
    ).toEqual({ href: '#/heizkreise?tab=fuel', label: 'Lieferung bearbeiten' })
  })

  it('führt Firmenbefunde gezielt zur Firmenverwaltung', () => {
    expect(
      validationIssueLink(issue('master_data', { type: 'Company', id: 'c-1' })),
    ).toEqual({ href: '#/firmen', label: 'Firma bearbeiten' })
  })

  it('führt fehlende Belegzuordnungen zur tatsächlich bearbeitbaren Stelle', () => {
    expect(
      validationIssueLink(
        issue(
          'documents',
          { type: 'CostEntry', id: 'cost-1' },
          'documents.booking_link_missing',
        ),
      ),
    ).toEqual({
      href: '#/kosten?tab=entries&edit=cost-1',
      label: 'Kostenposition bearbeiten',
    })

    expect(
      validationIssueLink(
        issue(
          'documents',
          { type: 'FuelDelivery', id: 'fuel-1' },
          'documents.booking_link_missing',
        ),
      ),
    ).toEqual({ href: '#/heizkreise?tab=fuel', label: 'Lieferung bearbeiten' })
  })

  it('führt eine fehlende Versandanschrift zur Nutzerbearbeitung', () => {
    expect(
      validationIssueLink(
        issue(
          'occupancy',
          { type: 'Tenancy', id: 'tenancy-1' },
          'occupancy.shipping_address_missing',
        ),
      ),
    ).toEqual({
      href: '#/nutzer?edit=tenancy-1',
      label: 'Versandanschrift ergänzen',
    })
  })
  it('führt Wohnungswärme-Befunde zur Ablesung, Zuordnung oder Belegung', () => {
    expect(
      validationIssueLink(
        issue(
          'meters',
          { type: 'Meter', id: 'zähler 1' },
          'metered.boundary_missing',
        ),
      ),
    ).toEqual({
      href: '#/heizkreise?tab=meters&meter=z%C3%A4hler%201',
      label: 'Ablesungen des Zählers bearbeiten',
    })
    expect(
      validationIssueLink(
        issue(
          'meters',
          { type: 'HeatingCircuit', id: 'circuit-1' },
          'metered.assignment_missing',
        ),
      ),
    ).toEqual({
      href: '#/heizkreise?tab=meters',
      label: 'Zählerzuordnung prüfen',
    })
    expect(
      validationIssueLink(
        issue(
          'occupancy',
          { type: 'OccupancyPeriod', id: 'occ-1' },
          'metered.occupancy_gap',
        ),
      ),
    ).toEqual({
      href: '#/nutzer?edit=occ-1',
      label: 'Nutzerzeitraum bearbeiten',
    })
    expect(
      validationIssueLink(
        issue(
          'occupancy',
          { type: 'Unit', id: 'unit-1' },
          'metered.occupancy_missing',
        ),
      ),
    ).toEqual({ href: '#/nutzer', label: 'Nutzerzeiträume bearbeiten' })
  })

  it('führt fehlende Verbrauchseinheiten zum Nutzerzeitraum', () => {
    expect(
      validationIssueLink(
        issue(
          'occupancy',
          { type: 'OccupancyPeriod', id: 'occ 1' },
          'heating.consumption_units_missing',
        ),
      ),
    ).toEqual({
      href: '#/nutzer?edit=occ%201',
      label: 'Verbrauchseinheiten ergänzen',
    })
  })

  it('führt den Auszugshinweis zur Nutzerbearbeitung', () => {
    expect(
      validationIssueLink(
        issue(
          'occupancy',
          { type: 'Tenancy', id: 'tenancy-1' },
          'occupancy.shipping_address_previous',
        ),
      ),
    ).toEqual({
      href: '#/nutzer?edit=tenancy-1',
      label: 'Neue Anschrift eintragen',
    })
  })
})
