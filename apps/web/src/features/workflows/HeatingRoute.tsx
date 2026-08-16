import { useState } from 'react'
import { FuelPanel } from './heating/FuelPanel'
import { HeatingSetupPanel } from './heating/HeatingSetupPanel'
import { MeterPanel } from './heating/MeterPanel'
import type { WorkflowSubRouteProps } from './route-types'

export type WorkflowApply = (
  transform: Parameters<WorkflowSubRouteProps['onApply']>[0],
) => boolean

export function HeatingRoute(props: WorkflowSubRouteProps) {
  const [activeTab, setActiveTab] = useState<'setup' | 'fuel' | 'meters'>(
    'setup',
  )
  const [error, setError] = useState<string | null>(null)

  const apply: WorkflowApply = (transform) => {
    setError(null)
    try {
      const accepted = props.onApply(transform)
      if (!accepted) setError('Die Änderung konnte nicht gespeichert werden.')
      return accepted
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Die Eingabe konnte nicht verarbeitet werden.',
      )
      return false
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <nav className="workflow-tabs" aria-label="Heizungsbereiche">
        <button
          type="button"
          aria-current={activeTab === 'setup' ? 'page' : undefined}
          onClick={() => setActiveTab('setup')}
        >
          Heizkreise
        </button>
        <button
          type="button"
          aria-current={activeTab === 'fuel' ? 'page' : undefined}
          onClick={() => setActiveTab('fuel')}
        >
          Brennstoffe
        </button>
        <button
          type="button"
          aria-current={activeTab === 'meters' ? 'page' : undefined}
          onClick={() => setActiveTab('meters')}
        >
          Zähler
        </button>
      </nav>
      {activeTab === 'setup' ? (
        <HeatingSetupPanel {...props} apply={apply} />
      ) : null}
      {activeTab === 'fuel' ? <FuelPanel {...props} apply={apply} /> : null}
      {activeTab === 'meters' ? <MeterPanel {...props} apply={apply} /> : null}
    </>
  )
}
