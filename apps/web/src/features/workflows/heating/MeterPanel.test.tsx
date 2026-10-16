import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
})
