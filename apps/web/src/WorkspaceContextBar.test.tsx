import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { emptySelection } from './app/selection'
import { WorkspaceContextBar } from './WorkspaceContextBar'

afterEach(cleanup)

describe('WorkspaceContextBar', () => {
  const context = {
    companies: [{ id: 'company-1', label: 'Testfirma' }],
    properties: [{ id: 'property-1', label: 'Testobjekt' }],
    billingPeriods: [{ id: 'period-1', label: '2026' }],
    companyLabel: 'Testfirma',
    propertyLabel: 'Testobjekt',
    billingPeriodLabel: '2026',
    statusLabel: 'Entwurf',
  }

  it('setzt abhängige Auswahlen beim Wechsel kontrolliert zurück', () => {
    const onSelectionChange = vi.fn()
    render(
      <WorkspaceContextBar
        context={context}
        selection={emptySelection}
        onSelectionChange={onSelectionChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Firma im Arbeitskontext'), {
      target: { value: 'company-1' },
    })
    fireEvent.change(screen.getByLabelText('Objekt im Arbeitskontext'), {
      target: { value: 'property-1' },
    })
    fireEvent.change(screen.getByLabelText('Zeitraum im Arbeitskontext'), {
      target: { value: 'period-1' },
    })
    fireEvent.change(screen.getByLabelText('Zeitraum im Arbeitskontext'), {
      target: { value: '' },
    })

    expect(onSelectionChange).toHaveBeenNthCalledWith(1, {
      ownerCompanyId: 'company-1',
      propertyId: null,
      billingPeriodId: null,
    })
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, {
      propertyId: 'property-1',
      billingPeriodId: null,
    })
    expect(onSelectionChange).toHaveBeenNthCalledWith(3, {
      billingPeriodId: 'period-1',
    })
    expect(onSelectionChange).toHaveBeenNthCalledWith(4, {
      billingPeriodId: null,
    })
    expect(screen.getByText('Entwurf')).toBeVisible()
  })

  it('deaktiviert leere Kontexte auch ohne Änderungshandler', () => {
    render(
      <WorkspaceContextBar
        context={{
          companies: [],
          properties: [],
          billingPeriods: [],
          companyLabel: 'Keine Firma',
          propertyLabel: 'Kein Objekt',
          billingPeriodLabel: 'Kein Zeitraum',
          statusLabel: 'Kein Status',
        }}
        selection={emptySelection}
      />,
    )

    expect(screen.getByLabelText('Firma im Arbeitskontext')).toBeDisabled()
    expect(screen.getByLabelText('Objekt im Arbeitskontext')).toBeDisabled()
    expect(screen.getByLabelText('Zeitraum im Arbeitskontext')).toBeDisabled()
  })
})
