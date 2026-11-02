import { describe, expect, it } from 'vitest'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

// PR-51, E-51-4: Prüfhinweise statt Schemaänderung.
const codes = (data: ReturnType<typeof validData>) =>
  validateBillingPeriod(data, 'period-1').issues.map(({ code }) => code)

describe('Datenintegrität', () => {
  it('meldet für den gültigen Bestand nichts', () => {
    expect(codes(validData())).not.toContain('schema.duplicate_id')
    expect(codes(validData())).not.toContain('schema.reference_mismatch')
  })

  it('meldet eine doppelte ID als Fehler, der die Freigabe blockiert', () => {
    const data = validData()
    data.masterData.units.push({ ...data.masterData.units[0]!, label: 'Kopie' })
    const report = validateBillingPeriod(data, 'period-1')
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'schema.duplicate_id',
          severity: 'error',
          entity: { type: 'units', id: 'unit-1' },
        }),
      ]),
    )
    expect(report.canBecomeReady).toBe(false)
  })

  it('meldet jede doppelte ID nur einmal', () => {
    const data = validData()
    const unit = data.masterData.units[0]!
    data.masterData.units.push({ ...unit }, { ...unit })
    expect(
      codes(data).filter((code) => code === 'schema.duplicate_id'),
    ).toHaveLength(1)
  })

  it('meldet eine Belegung, deren Mietverhältnis zu einer anderen Einheit gehört', () => {
    const data = validData()
    data.masterData.units.push({
      ...data.masterData.units[0]!,
      id: 'unit-2',
    })
    data.masterData.tenancies[0]!.unitId = 'unit-2'
    expect(codes(data)).toContain('schema.reference_mismatch')
  })

  it('meldet eine Belegung mit fehlender Einheit oder fremdem Objekt', () => {
    const missing = validData()
    missing.billingData.occupancyPeriods[0]!.unitId = 'unit-unbekannt'
    expect(codes(missing)).toContain('schema.reference_mismatch')

    const foreign = validData()
    foreign.masterData.units[0]!.propertyId = 'property-fremd'
    expect(codes(foreign)).toContain('schema.reference_mismatch')
  })

  it('meldet eine Belegung mit nicht vorhandenem Mietverhältnis', () => {
    const data = validData()
    data.billingData.occupancyPeriods[0]!.tenancyId = 'tenancy-unbekannt'
    expect(codes(data)).toContain('schema.reference_mismatch')
  })
})
