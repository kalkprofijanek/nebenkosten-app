import type { ChangeEvent } from 'react'

import type { SelectionContext } from './app/selection'
import type { WorkspaceContext } from './app/workspace-context'

interface WorkspaceContextBarProps {
  readonly context: WorkspaceContext
  readonly selection: SelectionContext
  readonly onSelectionChange?: (patch: Partial<SelectionContext>) => void
}

function selectedValue(value: string | null): string {
  return value ?? ''
}

export function WorkspaceContextBar({
  context,
  selection,
  onSelectionChange,
}: WorkspaceContextBarProps) {
  return (
    <div className="workspace-context" aria-label="Aktiver Abrechnungskontext">
      <label>
        <span>Firma</span>
        <select
          aria-label="Firma im Arbeitskontext"
          value={selectedValue(selection.ownerCompanyId)}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onSelectionChange?.({
              ownerCompanyId: event.target.value || null,
              propertyId: null,
              billingPeriodId: null,
            })
          }
          disabled={context.companies.length === 0}
        >
          <option value="">Keine Firma</option>
          {context.companies.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Objekt</span>
        <select
          aria-label="Objekt im Arbeitskontext"
          value={selectedValue(selection.propertyId)}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onSelectionChange?.({
              propertyId: event.target.value || null,
              billingPeriodId: null,
            })
          }
          disabled={context.properties.length === 0}
        >
          <option value="">Kein Objekt</option>
          {context.properties.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Zeitraum</span>
        <select
          aria-label="Zeitraum im Arbeitskontext"
          value={selectedValue(selection.billingPeriodId)}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onSelectionChange?.({ billingPeriodId: event.target.value || null })
          }
          disabled={context.billingPeriods.length === 0}
        >
          <option value="">Kein Zeitraum</option>
          {context.billingPeriods.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <span className="context-status">{context.statusLabel}</span>
    </div>
  )
}
