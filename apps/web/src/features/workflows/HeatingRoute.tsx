import { useEffect, useState } from 'react'
import { FuelPanel } from './heating/FuelPanel'
import { HeatingSetupPanel } from './heating/HeatingSetupPanel'
import { MeterPanel } from './heating/MeterPanel'
import type { WorkflowSubRouteProps } from './route-types'

export type WorkflowApply = (
  transform: Parameters<WorkflowSubRouteProps['onApply']>[0],
) => boolean

export type HeatingTab = 'setup' | 'fuel' | 'meters'

function hashTab(): HeatingTab {
  const value = new URLSearchParams(window.location.hash.split('?')[1]).get(
    'tab',
  )
  return value === 'fuel' || value === 'meters' ? value : 'setup'
}

interface HeatingRouteProps extends WorkflowSubRouteProps {
  readonly initialTab?: HeatingTab
}

export function HeatingRoute(props: HeatingRouteProps) {
  const [activeTab, setActiveTab] = useState<HeatingTab>(
    () =>
      props.initialTab ??
      (window.location.hash.split('?')[0] === '#/heizkreise'
        ? hashTab()
        : 'setup'),
  )
  useEffect(() => {
    function followHash() {
      if (
        props.initialTab === undefined &&
        window.location.hash.split('?')[0] === '#/heizkreise'
      ) {
        setActiveTab(hashTab())
      }
    }
    window.addEventListener('hashchange', followHash)
    return () => window.removeEventListener('hashchange', followHash)
  }, [props.initialTab])

  function selectTab(tab: HeatingTab) {
    setActiveTab(tab)
    if (
      props.initialTab === undefined &&
      window.location.hash.split('?')[0] === '#/heizkreise'
    ) {
      window.location.hash = `/heizkreise?tab=${tab}`
    }
  }
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
          onClick={() => selectTab('setup')}
        >
          Heizkreise
        </button>
        <button
          type="button"
          aria-current={activeTab === 'fuel' ? 'page' : undefined}
          onClick={() => selectTab('fuel')}
        >
          Brennstoffe
        </button>
        <button
          type="button"
          aria-current={activeTab === 'meters' ? 'page' : undefined}
          onClick={() => selectTab('meters')}
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
