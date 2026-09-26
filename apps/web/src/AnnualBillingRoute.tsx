import { BillingJourney } from './features/workflows/BillingJourney'
import {
  HeatingRoute,
  type HeatingTab,
} from './features/workflows/HeatingRoute'
import { WorkflowRoute } from './WorkflowRoute'
import { CalculationRoute } from './CalculationRoute'
import { ReleaseRoute } from './ReleaseRoute'
import { applyEditableBillingPeriodChange } from './features/release/edit-guard'
import type { WorkflowSubRouteProps } from './features/workflows/route-types'

export function AnnualBillingRoute(props: WorkflowSubRouteProps) {
  const { data, selection, onApply } = props
  const periodId = selection.billingPeriodId
  const edit: WorkflowSubRouteProps['onApply'] = (transform) =>
    onApply((current) =>
      periodId === null
        ? transform(current)
        : applyEditableBillingPeriodChange(current, periodId, transform),
    )
  return (
    <BillingJourney
      key={periodId}
      data={data}
      billingPeriodId={periodId}
      renderStep={(path) => {
        if (path === '/abrechnungsjahre')
          return (
            <p>
              Prüfe Objekt und Zeitraum in der Übersicht oben. Änderungen am
              Zeitraum sowie das Anlegen und Löschen von Jahren erfolgen in der
              Jahresverwaltung.{' '}
              <a href="#/abrechnungsjahre">Jahresverwaltung öffnen</a>
            </p>
          )
        if (path === '/freigabe')
          return (
            <ReleaseRoute
              data={data}
              billingPeriodId={periodId}
              onApply={onApply}
            />
          )
        if (path === '/berechnung')
          return (
            <CalculationRoute
              data={data}
              billingPeriodId={periodId}
              onApply={edit}
            />
          )
        if (path.startsWith('/heizkreise'))
          return (
            <HeatingRoute
              {...props}
              onApply={edit}
              initialTab={
                new URLSearchParams(path.split('?')[1]).get('tab') as HeatingTab
              }
            />
          )
        return <WorkflowRoute {...props} onApply={edit} path={path} />
      }}
    />
  )
}
