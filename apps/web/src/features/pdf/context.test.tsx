import type { CalculationOutput } from '@nebenkosten/core'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  buildCombinedCostStatementContext,
  buildTenantStatementContext,
  latestCalculationOutput,
  tenantOccupancies,
} from './context'

const PERIOD_ID = '40000000-0000-4000-8000-000000000001'
const PROPERTY_ID = '40000000-0000-4000-8000-000000000002'
const OWNER_ID = '40000000-0000-4000-8000-000000000003'
const UNIT_ID = '40000000-0000-4000-8000-000000000004'
const TENANCY_ID = '40000000-0000-4000-8000-000000000005'
const PERSON_ID = '40000000-0000-4000-8000-000000000006'
const OCCUPANCY_ID = '40000000-0000-4000-8000-000000000007'
const RUN_ID = '40000000-0000-4000-8000-000000000008'
const RESULT_ID = '40000000-0000-4000-8000-000000000009'

function calculationOutput(): CalculationOutput {
  return {
    snapshotFormatVersion: 2,
    periodDays: 365,
    totals: {
      recordedCostsCents: 1000,
      tenantTotalCents: 1000,
      landlordTotalCents: 0,
      unallocatedCents: 0,
      prepaymentsCents: 0,
      controlDifferenceCents: 0,
      directCostsCents: 0,
      internalCostsCents: 0,
    },
    heating: {
      totalCents: 0,
      baseCostsCents: 0,
      consumptionCostsCents: 0,
      fuelConsumptionCents: 0,
      unallocatedLandlordCents: 0,
      perCircuit: [],
      operatingElectricity: {
        sourceBudgetCents: 0,
        intendedCents: 0,
        movedCents: 0,
        uncoveredCents: 0,
        sources: [],
      },
      trace: {
        traceFormatVersion: 1,
        operatingElectricity: {
          sourceBudgetCents: 0,
          intendedCents: 0,
          movedCents: 0,
          uncoveredCents: 0,
          sources: [],
        },
        circuits: [],
      },
    },
    co2: { totalCostCents: 0, tenantCents: 0, landlordCents: 0 },
    vacancyLandlordCents: 0,
    tenants: [
      {
        id: OCCUPANCY_ID,
        isVacancy: false,
        shareCents: 1000,
        prepaymentCents: 800,
        balanceCents: 200,
        status: 'gruen',
        costBreakdown: {
          operatingByCategory: [],
          heatingBaseCents: 0,
          heatingConsumptionCents: 0,
          hotWaterCents: 0,
          heatingCo2Cents: 0,
        },
      },
    ],
    warnings: [],
  }
}

function fixtureAppData(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      ownerCompanies: [
        {
          id: OWNER_ID,
          organizationId: '40000000-0000-4000-8000-00000000000a',
          name: 'Beispiel GmbH',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: PROPERTY_ID, ownerCompanyId: OWNER_ID }],
      units: [{ id: UNIT_ID, propertyId: PROPERTY_ID, label: 'WE 1' }],
      persons: [
        {
          id: PERSON_ID,
          organizationId: '40000000-0000-4000-8000-00000000000a',
          displayName: 'Anna Müller',
        },
      ],
      tenancies: [
        {
          id: TENANCY_ID,
          unitId: UNIT_ID,
          personIds: [PERSON_ID],
          shippingAddressStreet: 'Musterweg',
          shippingAddressPostalCodeAndCity: '00000 Musterstadt',
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: PERIOD_ID,
          propertyId: PROPERTY_ID,
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'READY_FOR_PDF',
        },
      ],
      occupancyPeriods: [
        {
          id: OCCUPANCY_ID,
          billingPeriodId: PERIOD_ID,
          unitId: UNIT_ID,
          tenancyId: TENANCY_ID,
          kind: 'tenant',
        },
      ],
      calculationRuns: [
        {
          id: RUN_ID,
          billingPeriodId: PERIOD_ID,
          startedAt: '2026-01-15T10:00:00.000Z',
        },
      ],
      calculationResults: [
        {
          id: RESULT_ID,
          calculationRunId: RUN_ID,
          totals: {
            recordedCostsCents: 1000,
            tenantTotalCents: 1000,
            landlordTotalCents: 0,
            unallocatedCents: 0,
            prepaymentsCents: 0,
            controlDifferenceCents: 0,
          },
          warnings: [],
          snapshotFormatVersion: 2,
          resultSnapshot: calculationOutput(),
        },
      ],
    },
  }
}

describe('latestCalculationOutput', () => {
  it('liefert das jüngste Berechnungsergebnis', () => {
    const data = fixtureAppData()
    expect(
      latestCalculationOutput(data, PERIOD_ID)?.totals.recordedCostsCents,
    ).toBe(1000)
  })

  it('liefert undefined ohne Berechnungslauf', () => {
    const data = fixtureAppData()
    data.billingData.calculationRuns = []
    expect(latestCalculationOutput(data, PERIOD_ID)).toBeUndefined()
  })

  it('liefert undefined ohne passendes Ergebnis', () => {
    const data = fixtureAppData()
    data.billingData.calculationResults = []
    expect(latestCalculationOutput(data, PERIOD_ID)).toBeUndefined()
  })
})

describe('tenantOccupancies', () => {
  it('filtert auf Mieter-Nutzungszeiträume des Abrechnungsjahres', () => {
    const data = fixtureAppData()
    expect(tenantOccupancies(data, PERIOD_ID)).toHaveLength(1)
    expect(tenantOccupancies(data, 'other-period')).toHaveLength(0)
  })
})

describe('buildTenantStatementContext', () => {
  it('verbindet alle Entitäten für einen Nutzungszeitraum', () => {
    const data = fixtureAppData()
    const billingPeriod = data.billingData.billingPeriods[0]!
    const calculation = calculationOutput()
    const occupancy = data.billingData.occupancyPeriods[0]!

    const context = buildTenantStatementContext(
      data,
      billingPeriod,
      calculation,
      occupancy,
    )

    expect(context.unit.id).toBe(UNIT_ID)
    expect(context.tenancy.id).toBe(TENANCY_ID)
    expect(context.ownerCompany.id).toBe(OWNER_ID)
    expect(context.persons).toHaveLength(1)
  })

  it('wirft, wenn kein Mietverhältnis gefunden wird', () => {
    const data = fixtureAppData()
    const billingPeriod = data.billingData.billingPeriods[0]!
    const occupancy = {
      ...data.billingData.occupancyPeriods[0]!,
      tenancyId: 'unknown',
    }
    expect(() =>
      buildTenantStatementContext(
        data,
        billingPeriod,
        calculationOutput(),
        occupancy,
      ),
    ).toThrow()
  })

  it('wirft, wenn keine Einheit gefunden wird', () => {
    const data = fixtureAppData()
    const billingPeriod = data.billingData.billingPeriods[0]!
    const occupancy = {
      ...data.billingData.occupancyPeriods[0]!,
      unitId: 'unknown',
    }
    expect(() =>
      buildTenantStatementContext(
        data,
        billingPeriod,
        calculationOutput(),
        occupancy,
      ),
    ).toThrow()
  })
})

describe('buildCombinedCostStatementContext', () => {
  it('verbindet Objekt und Eigentümergesellschaft', () => {
    const data = fixtureAppData()
    const billingPeriod = data.billingData.billingPeriods[0]!
    const context = buildCombinedCostStatementContext(
      data,
      billingPeriod,
      calculationOutput(),
    )
    expect(context.property.id).toBe(PROPERTY_ID)
    expect(context.ownerCompany.id).toBe(OWNER_ID)
    expect(context.occupancyPeriods).toHaveLength(1)
  })

  it('wirft ohne Objekt', () => {
    const data = fixtureAppData()
    const billingPeriod = {
      ...data.billingData.billingPeriods[0]!,
      propertyId: 'unknown',
    }
    expect(() =>
      buildCombinedCostStatementContext(
        data,
        billingPeriod,
        calculationOutput(),
      ),
    ).toThrow()
  })
})
