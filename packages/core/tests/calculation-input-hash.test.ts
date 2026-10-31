import { describe, expect, it } from 'vitest'
import {
  calculationInputSha256,
  createCalculationInput,
  sha256Hex,
} from '../src'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import scenarioFile from '../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../tests/characterization/types'

const scenario = (scenarioFile.scenarios as unknown as Scenario[]).find(
  ({ id }) => id === 'case-01-full-year',
)!

function input(
  mutate: (data: ReturnType<typeof buildAppDataFile>) => void = () => {},
) {
  const data = buildAppDataFile(structuredClone(scenario))
  mutate(data)
  return createCalculationInput(data, 'bp-1')
}

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('entspricht dem Referenzwert für %j', (text, expected) => {
    expect(sha256Hex(text)).toBe(expected)
  })

  it('verarbeitet Texte über mehrere Blöcke und Mehrbytezeichen', async () => {
    const { createHash } = await import('node:crypto')
    for (const text of [
      'Grundsteuer €',
      'x'.repeat(55),
      'y'.repeat(64),
      'ä'.repeat(1000),
      'm² 😀 ß',
      'a\ud800b',
    ])
      expect(sha256Hex(text)).toBe(
        createHash('sha256').update(text, 'utf8').digest('hex'),
      )
  })
})

describe('calculationInputSha256', () => {
  it('ist für denselben Eingabestand stabil', () => {
    expect(calculationInputSha256(input())).toBe(
      calculationInputSha256(input()),
    )
    expect(calculationInputSha256(input())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ändert sich mit einer rechenrelevanten Eingabe', () => {
    const changed = input((data) => {
      const unit = data.masterData.units[0]!
      unit.usableAreaSqm = { value: 123.45, unit: 'm2' }
    })
    expect(calculationInputSha256(changed)).not.toBe(
      calculationInputSha256(input()),
    )
  })

  it('bleibt bei Freigabestatus, Versanddatum, Zeitstempel und Anschreiben gleich', () => {
    const released = input((data) => {
      const period = data.billingData.billingPeriods[0]!
      period.status = 'FINALIZED'
      period.dispatchDate = '2026-03-01'
      period.lastModifiedAt = '2026-03-01T10:00:00.000Z'
      period.coverLetter = { active: true, text: 'Hallo {{name}}' }
      period.notes = { general: 'Hinweis' }
    })
    expect(calculationInputSha256(released)).toBe(
      calculationInputSha256(input()),
    )
  })

  it('hängt nicht von der Reihenfolge der Objektschlüssel ab', () => {
    const base = input()
    const reordered = Object.fromEntries(
      Object.entries(base).reverse(),
    ) as typeof base
    expect(calculationInputSha256(reordered)).toBe(calculationInputSha256(base))
  })
})
