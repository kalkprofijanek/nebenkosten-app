import type { AppDataFile, BillingPeriodStatus } from '@nebenkosten/schema'

import type { SelectionContext } from './selection'

export interface WorkspaceContextOption {
  readonly id: string
  readonly label: string
}

export interface WorkspaceContext {
  readonly companies: readonly WorkspaceContextOption[]
  readonly properties: readonly WorkspaceContextOption[]
  readonly billingPeriods: readonly WorkspaceContextOption[]
  readonly companyLabel: string
  readonly propertyLabel: string
  readonly billingPeriodLabel: string
  readonly statusLabel: string
}

const statusLabels: Readonly<Record<BillingPeriodStatus, string>> = {
  DRAFT: 'Entwurf',
  IN_REVIEW: 'Prüfung offen',
  READY_FOR_PDF: 'PDF bereit',
  FINALIZED: 'Abgeschlossen',
  SUPERSEDED: 'Ersetzt',
}

function propertyLabel(
  property: AppDataFile['masterData']['properties'][number],
): string {
  const address = property.address?.street?.trim()
  const number =
    property.internalNumber?.trim() ?? property.externalNumber?.trim()
  const parts = [address, number].filter(
    (part): part is string => part !== undefined && part.length > 0,
  )
  return parts.length > 0 ? parts.join(' · ') : 'Objekt ohne Bezeichnung'
}

export function buildWorkspaceContext(
  data: AppDataFile | null | undefined,
  selection: SelectionContext,
): WorkspaceContext {
  if (data === null || data === undefined) {
    return {
      companies: [],
      properties: [],
      billingPeriods: [],
      companyLabel: 'Keine Firma gewählt',
      propertyLabel: 'Kein Objekt gewählt',
      billingPeriodLabel: 'Kein Zeitraum gewählt',
      statusLabel: 'Ohne Arbeitsbestand',
    }
  }

  const companies = data.masterData.ownerCompanies.map(({ id, name }) => ({
    id,
    label: name,
  }))
  const properties = data.masterData.properties
    .filter(({ ownerCompanyId }) => ownerCompanyId === selection.ownerCompanyId)
    .map((property) => ({ id: property.id, label: propertyLabel(property) }))
  const billingPeriods = data.billingData.billingPeriods
    .filter(({ propertyId }) => propertyId === selection.propertyId)
    .sort((left, right) => right.year - left.year)
    .map(({ id, year }) => ({ id, label: String(year) }))
  const company = companies.find(({ id }) => id === selection.ownerCompanyId)
  const property = properties.find(({ id }) => id === selection.propertyId)
  const billingPeriod = data.billingData.billingPeriods.find(
    ({ id }) => id === selection.billingPeriodId,
  )

  return {
    companies,
    properties,
    billingPeriods,
    companyLabel: company?.label ?? 'Keine Firma gewählt',
    propertyLabel: property?.label ?? 'Kein Objekt gewählt',
    billingPeriodLabel:
      billingPeriods.find(({ id }) => id === selection.billingPeriodId)
        ?.label ?? 'Kein Zeitraum gewählt',
    statusLabel:
      billingPeriod === undefined
        ? 'Kein Abrechnungsstatus'
        : statusLabels[billingPeriod.status],
  }
}
