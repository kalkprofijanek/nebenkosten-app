import { describe, expect, it } from 'vitest'
import { isGridEnergySource } from '../src'

describe('isGridEnergySource', () => {
  it.each([
    { key: 'wp_strom', name: null, sourceType: null },
    { key: 'haupt', name: 'Wärmepumpe', sourceType: null },
    { key: 'haupt', name: null, sourceType: 'Strom' },
    { key: 'haupt', name: null, sourceType: 'Fernwaerme' },
    { key: 'gas', name: null, sourceType: 'Erdgas' },
    { key: 'wp', name: null, sourceType: null },
  ])('erkennt leitungsgebundene Energie (%o)', (source) => {
    expect(isGridEnergySource(source)).toBe(true)
  })

  it.each([
    { key: 'haupt', name: null, sourceType: 'Heizöl' },
    { key: 'gas', name: null, sourceType: 'Flüssiggas (Propan)' },
    { key: 'haupt', name: 'Pellets', sourceType: null },
    { key: 'wpx', name: undefined, sourceType: undefined },
  ])(
    'behandelt lagerfähige Brennstoffe nicht als Leitungsenergie (%o)',
    (source) => {
      expect(isGridEnergySource(source)).toBe(false)
    },
  )
})
