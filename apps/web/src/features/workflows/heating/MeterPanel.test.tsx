import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createHotWaterFixture,
  createMeteredFixture,
  meteringId as id,
} from '../../metering/metered-fixture'
import { MeterPanel } from './MeterPanel'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  window.history.replaceState(null, '', '#/')
})

function fixtureWithTwoMeters() {
  const source = createMeteredFixture()
  return {
    ...source,
    masterData: {
      ...source.masterData,
      meters: [
        ...source.masterData.meters,
        {
          id: id(30),
          propertyId: id(3),
          kind: 'unit_heat' as const,
          meterNumber: 'TEST-WMZ-2',
        },
      ],
    },
  }
}

function show() {
  return (
    <MeterPanel
      data={fixtureWithTwoMeters()}
      selection={{
        ownerCompanyId: id(2),
        propertyId: id(3),
        billingPeriodId: id(10),
      }}
      onSelectionChange={vi.fn()}
      onApply={vi.fn(() => true)}
      apply={vi.fn(() => true)}
    />
  )
}

const meterHeading = () =>
  screen.getByRole('heading', { level: 2, name: /TEST-WMZ/ })

describe('MeterPanel', () => {
  it('wählt ohne Korrekturlink den ersten Zähler', () => {
    render(show())
    expect(meterHeading()).toHaveTextContent('TEST-WMZ-1')
    expect(screen.getByLabelText('Zählerstand (kWh)')).toBeVisible()
    expect(screen.getByLabelText('Ableseeinheit')).toHaveValue('kWh')
  })

  it('öffnet den Zähler aus einem Korrekturlink und folgt weiteren Links', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.history.replaceState(
      null,
      '',
      `#/heizkreise?tab=meters&meter=${id(30)}`,
    )
    render(show())
    expect(meterHeading()).toHaveTextContent('TEST-WMZ-2')
    expect(scroll).toHaveBeenCalled()
    act(() => {
      window.history.replaceState(
        null,
        '',
        `#/heizkreise?tab=meters&meter=${id(7)}`,
      )
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(meterHeading()).toHaveTextContent('TEST-WMZ-1')
  })

  it('ignoriert unbekannte Zähler und fremde Routen', () => {
    window.history.replaceState(null, '', '#/heizkreise?meter=unbekannt')
    render(show())
    expect(meterHeading()).toHaveTextContent('TEST-WMZ-1')
    cleanup()
    window.history.replaceState(null, '', `#/abrechnungsablauf?meter=${id(30)}`)
    render(show())
    expect(meterHeading()).toHaveTextContent('TEST-WMZ-1')
  })

  it('bietet Warmwasserzähler an und erfasst deren Stände fest in m³', () => {
    const apply = vi.fn(() => true)
    render(
      <MeterPanel
        data={createHotWaterFixture()}
        selection={{
          ownerCompanyId: id(2),
          propertyId: id(3),
          billingPeriodId: id(10),
        }}
        onSelectionChange={vi.fn()}
        onApply={vi.fn(() => true)}
        apply={apply}
      />,
    )
    const kind = screen.getByLabelText('Zählerart')
    expect(
      within(kind).getByRole('option', {
        name: 'Wohnungs-Warmwasserzähler (m³)',
      }),
    ).toHaveValue('unit_hot_water')
    expect(
      screen.getByRole('heading', { name: 'Warmwasserzähler je Wohnung' }),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Aktiver Zähler'), {
      target: { value: id(41) },
    })
    expect(
      screen.getByText('Wohnungs-Warmwasserzähler (m³)', {
        selector: '.section-kicker',
      }),
    ).toBeVisible()
    expect(screen.getByLabelText('Zählerstand (m³)')).toBeVisible()
    const unit = screen.getByLabelText('Ableseeinheit')
    expect(unit).toHaveValue('m3')
    expect(within(unit).getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Zähler bearbeiten' }))
    expect(screen.getByLabelText('Zählerart bearbeiten')).toHaveValue(
      'unit_hot_water',
    )
  })

  it('lässt Allgemeinstromzähler bei freier Ableseeinheit', () => {
    const source = createMeteredFixture()
    render(
      <MeterPanel
        data={{
          ...source,
          masterData: {
            ...source.masterData,
            meters: [{ id: id(30), propertyId: id(3), kind: 'general' }],
          },
        }}
        selection={{
          ownerCompanyId: id(2),
          propertyId: id(3),
          billingPeriodId: id(10),
        }}
        onSelectionChange={vi.fn()}
        onApply={vi.fn(() => true)}
        apply={vi.fn(() => true)}
      />,
    )
    expect(screen.getByLabelText('Zählerstand')).toBeVisible()
    expect(
      within(screen.getByLabelText('Ableseeinheit')).getAllByRole('option'),
    ).toHaveLength(5)
  })
})
