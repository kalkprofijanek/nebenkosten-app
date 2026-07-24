import type { AppDataFile } from '@nebenkosten/schema'
import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import type {
  CombinedCostStatementContext,
  TenantStatementContext,
} from '../src/contracts'

export function buildFixtureAppData(caseId = 'case-01-full-year'): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === caseId)
  if (!scenario) throw new Error(`Testszenario "${caseId}" fehlt`)
  const appData = structuredClone(buildAppDataFile(scenario))

  appData.masterData.tenancies = appData.masterData.tenancies.map(
    (tenancy, index) => ({
      ...tenancy,
      shippingAddressStreet: `Musterweg ${index + 1}`,
      shippingAddressPostalCodeAndCity: '00000 Musterstadt',
    }),
  )
  appData.masterData.ownerCompanies = appData.masterData.ownerCompanies.map(
    (ownerCompany) => ({
      ...ownerCompany,
      address: {
        street: 'Verwalterstraße',
        postalCodeAndCity: '00000 Musterstadt',
      },
      bankAccount: {
        iban: ['DE89', '370400440532013000'].join(''),
        bic: 'COBADEFFXXX',
      },
    }),
  )
  appData.billingData.billingPeriods = appData.billingData.billingPeriods.map(
    (period) => ({
      ...period,
      status: 'READY_FOR_PDF',
      notes: { general: 'Bitte prüfen Sie die Abrechnung sorgfältig.' },
      coverLetter: {
        active: true,
        text: 'Hallo {{name}}, anbei die Abrechnung {{jahr}} für {{nutzeinheit}}.',
      },
    }),
  )
  return appData
}

export function buildFixtureCalculation(appData: AppDataFile) {
  return calculateBilling(
    createCalculationInput(appData, appData.billingData.billingPeriods[0]!.id),
  )
}

export function buildFixtureTenantStatementContext(
  appData: AppDataFile,
): TenantStatementContext {
  const billingPeriod = appData.billingData.billingPeriods[0]!
  const calculation = buildFixtureCalculation(appData)
  const occupancyPeriod = appData.billingData.occupancyPeriods.find(
    (occupancy) => occupancy.kind === 'tenant',
  )
  if (!occupancyPeriod)
    throw new Error('Kein Mieter-Nutzungszeitraum in Fixture.')
  const tenancy = appData.masterData.tenancies.find(
    ({ id }) => id === occupancyPeriod.tenancyId,
  )
  if (!tenancy) throw new Error('Kein Mietverhältnis in Fixture.')
  const unit = appData.masterData.units.find(
    ({ id }) => id === occupancyPeriod.unitId,
  )
  if (!unit) throw new Error('Keine Einheit in Fixture.')
  const property = appData.masterData.properties[0]!
  const ownerCompany = appData.masterData.ownerCompanies[0]!
  const persons = appData.masterData.persons.filter((person) =>
    tenancy.personIds.includes(person.id),
  )

  return {
    appData,
    billingPeriod,
    calculation,
    occupancyPeriod,
    tenancy,
    unit,
    property,
    ownerCompany,
    persons,
    costCategories: appData.billingData.costCategories,
    generatedAt: new Date('2026-01-15T10:00:00.000Z'),
  }
}

export function buildFixtureCombinedContext(
  appData: AppDataFile,
): CombinedCostStatementContext {
  const billingPeriod = appData.billingData.billingPeriods[0]!
  const calculation = buildFixtureCalculation(appData)
  return {
    appData,
    billingPeriod,
    calculation,
    property: appData.masterData.properties[0]!,
    ownerCompany: appData.masterData.ownerCompanies[0]!,
    costCategories: appData.billingData.costCategories,
    occupancyPeriods: appData.billingData.occupancyPeriods,
    tenancies: appData.masterData.tenancies,
    units: appData.masterData.units,
    generatedAt: new Date('2026-01-15T10:00:00.000Z'),
  }
}
