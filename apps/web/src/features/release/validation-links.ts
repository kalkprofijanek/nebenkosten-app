import type { ValidationArea, ValidationIssue } from '@nebenkosten/schema'

interface ValidationIssueLink {
  readonly href: `#/${string}` | '#/'
  readonly label: string
}

const areaLinks: Readonly<Record<ValidationArea, ValidationIssueLink>> = {
  master_data: { href: '#/objekte', label: 'Stammdaten bearbeiten' },
  billing_period: {
    href: '#/abrechnungsjahre',
    label: 'Abrechnungsjahr bearbeiten',
  },
  occupancy: { href: '#/nutzer', label: 'Nutzer bearbeiten' },
  costs: { href: '#/kosten', label: 'Kosten bearbeiten' },
  bookings: { href: '#/kosten', label: 'Kosten bearbeiten' },
  heating: { href: '#/heizkreise', label: 'Heizung bearbeiten' },
  hot_water: { href: '#/heizkreise', label: 'Heizung bearbeiten' },
  co2: { href: '#/heizkreise', label: 'Heizung bearbeiten' },
  meters: { href: '#/heizkreise', label: 'Zähler bearbeiten' },
  prepayments: { href: '#/nutzer', label: 'Nutzer bearbeiten' },
  totals: { href: '#/berechnung', label: 'Berechnung prüfen' },
  documents: { href: '#/pdf-export', label: 'Dokumente bearbeiten' },
  migration: { href: '#/sicherung', label: 'Datenbestand prüfen' },
  schema: { href: '#/sicherung', label: 'Datenbestand prüfen' },
  other: { href: '#/', label: 'Übersicht öffnen' },
}

export function validationIssueLink(
  issue: Pick<ValidationIssue, 'area' | 'code' | 'entity'>,
): ValidationIssueLink {
  if (issue.code === 'documents.booking_link_missing') {
    if (issue.entity?.type === 'CostEntry') {
      return {
        href: `#/kosten?tab=entries&edit=${encodeURIComponent(issue.entity.id)}`,
        label: 'Kostenposition bearbeiten',
      }
    }
    if (issue.entity?.type === 'FuelDelivery') {
      return { href: '#/heizkreise', label: 'Lieferung bearbeiten' }
    }
  }

  if (issue.code === 'occupancy.shipping_address_missing') {
    return {
      href: `#/nutzer?edit=${encodeURIComponent(issue.entity?.id ?? '')}`,
      label: 'Versandanschrift ergänzen',
    }
  }

  if (issue.area === 'master_data') {
    const entityType = issue.entity?.type.toLowerCase()
    if (entityType === 'company' || entityType === 'firm') {
      return { href: '#/firmen', label: 'Firma bearbeiten' }
    }
  }

  return areaLinks[issue.area]
}
