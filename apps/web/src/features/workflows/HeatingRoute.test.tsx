import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeatingRoute } from './HeatingRoute'

vi.mock('./heating/HeatingSetupPanel', () => ({
  HeatingSetupPanel: () => <p>Setup content</p>,
}))
vi.mock('./heating/FuelPanel', () => ({ FuelPanel: () => <p>Fuel content</p> }))
vi.mock('./heating/MeterPanel', () => ({
  MeterPanel: () => <p>Meter content</p>,
}))
const props = {
  data: createEmptyAppDataFile(),
  selection: { ownerCompanyId: null, propertyId: null, billingPeriodId: null },
  onSelectionChange: vi.fn(),
  onApply: vi.fn(() => true),
}
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '#/')
})

describe('HeatingRoute navigation', () => {
  it('opens and follows direct meter and fuel links', () => {
    window.history.replaceState(null, '', '#/heizkreise?tab=meters')
    render(<HeatingRoute {...props} />)
    expect(screen.getByText('Meter content')).toBeVisible()
    act(() => {
      window.history.replaceState(null, '', '#/heizkreise?tab=fuel')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByText('Fuel content')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Heizkreise' }))
    expect(screen.getByText('Setup content')).toBeVisible()
    expect(window.location.hash).toBe('#/heizkreise?tab=setup')
  })
  it('defaults unknown tabs to setup', () => {
    window.history.replaceState(null, '', '#/heizkreise?tab=unknown')
    render(<HeatingRoute {...props} />)
    expect(screen.getByText('Setup content')).toBeVisible()
  })
  it('embeds the requested tab without leaving the parent workflow', () => {
    window.history.replaceState(null, '', '#/abrechnungsablauf')
    render(<HeatingRoute {...props} initialTab="fuel" />)
    expect(screen.getByText('Fuel content')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Zähler' }))
    expect(screen.getByText('Meter content')).toBeVisible()
    expect(window.location.hash).toBe('#/abrechnungsablauf')
  })
})
