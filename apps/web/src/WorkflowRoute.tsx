import type { AppDataFile } from '@nebenkosten/schema'
import type { ReactNode } from 'react'
import { BillingPeriodsRoute } from './features/workflows/BillingPeriodsRoute'
import { CompanyRoute } from './features/workflows/CompanyRoute'
import { CostsRoute } from './features/workflows/CostsRoute'
import { HeatingRoute } from './features/workflows/HeatingRoute'
import { OccupanciesRoute } from './features/workflows/OccupanciesRoute'
import { PropertyRoute } from './features/workflows/PropertyRoute'

export interface WorkflowSelection {
  readonly ownerCompanyId: string | null
  readonly propertyId: string | null
  readonly billingPeriodId: string | null
}

interface WorkflowRouteProps {
  readonly path: string
  readonly data: AppDataFile
  readonly selection: WorkflowSelection
  readonly onSelectionChange: (patch: Partial<WorkflowSelection>) => void
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}

function ContextNeeded({ children }: { readonly children: ReactNode }) {
  return <p role="alert">{children}</p>
}

export function WorkflowRoute(props: WorkflowRouteProps) {
  const { path, data, selection } = props

  if (path === '/firmen') return <CompanyRoute {...props} />

  if (path === '/objekte') {
    if (!selection.ownerCompanyId)
      return (
        <ContextNeeded>
          Bitte zuerst eine Firma auswählen oder anlegen.
        </ContextNeeded>
      )
    return <PropertyRoute {...props} />
  }

  if (path === '/abrechnungsjahre') {
    if (!selection.propertyId)
      return <ContextNeeded>Bitte zuerst ein Objekt auswählen.</ContextNeeded>
    return <BillingPeriodsRoute {...props} />
  }

  if (!['/nutzer', '/kosten', '/heizkreise'].includes(path)) return null

  if (!selection.billingPeriodId)
    return (
      <ContextNeeded>Bitte zuerst ein Abrechnungsjahr auswählen.</ContextNeeded>
    )

  if (
    !data.billingData.billingPeriods.some(
      ({ id }) => id === selection.billingPeriodId,
    )
  )
    return (
      <ContextNeeded>
        Das ausgewählte Abrechnungsjahr ist nicht mehr vorhanden.
      </ContextNeeded>
    )

  if (path === '/nutzer') return <OccupanciesRoute {...props} />
  if (path === '/kosten') return <CostsRoute {...props} />
  return <HeatingRoute {...props} />
}
