import { describe, expect, it } from 'vitest'
import { buildTenantStatement } from '../src/tenant-statement'
import { MissingShippingAddressError } from '../src/contracts'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

describe('buildTenantStatement', () => {
  it('baut ein vollständiges TDocumentDefinitions-Objekt', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)

    expect(doc.pageSize).toBe('A4')
    expect(Array.isArray(doc.content)).toBe(true)
    expect((doc.content as unknown[]).length).toBeGreaterThan(0)
    expect(typeof doc.footer).toBe('function')
    const footer = doc.footer as (
      currentPage: number,
      pageCount: number,
    ) => { text: string }
    expect(footer(1, 3).text).toContain('Seite 1/3')
    expect(footer(1, 3).text).toContain(['DE89', '370400440532013000'].join(''))
  })

  it('interpoliert das Anschreiben mit den Mieterdaten', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain(String(context.billingPeriod.year))
    expect(serialized).not.toContain('{{jahr}}')
  })

  it('wirft MissingShippingAddressError ohne Versandadresse', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const patchedContext = {
      ...context,
      tenancy: { ...context.tenancy, shippingAddressStreet: null },
    }

    expect(() => buildTenantStatement(patchedContext)).toThrow(
      MissingShippingAddressError,
    )
  })

  it('wirft, wenn kein Berechnungsergebnis für den Nutzungszeitraum existiert', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const patchedContext = {
      ...context,
      occupancyPeriod: { ...context.occupancyPeriod, id: 'unknown-occupancy' },
    }

    expect(() => buildTenantStatement(patchedContext)).toThrow()
  })

  it('zeigt die Heizkosten-Aufschlüsselung bei einem Heizkreis', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain('Heizkosten-Aufschlüsselung')
  })

  it('zeigt den CO2-Ausweis, wenn CO2-Kosten anfallen', () => {
    const appData = buildFixtureAppData('case-12-co2-split')
    const context = buildFixtureTenantStatementContext(appData)
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )
    expect(tenant?.costBreakdown.heatingCo2Cents).toBeGreaterThan(0)

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).toContain('CO2-Ausweis')
  })

  it('zeigt den CO2-Ausweis auch bei emissionsfreier Heizung mit null Kosten', () => {
    const appData = buildFixtureAppData('case-08-heat-pump')
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain('CO2-Ausweis')
    expect(serialized).toContain('emissionsarme Heizung')
  })

  it('erklärt den tatsächlich berechneten Heizkreis-Split', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    const originalContext = buildFixtureTenantStatementContext(appData)
    const context = {
      ...originalContext,
      calculation: {
        ...originalContext.calculation,
        heating: {
          ...originalContext.calculation.heating,
          trace: {
            ...originalContext.calculation.heating.trace,
            circuits: originalContext.calculation.heating.trace.circuits.map(
              (circuit) => ({
                ...circuit,
                split: {
                  ...circuit.split,
                  consumptionSharePercent: 55,
                  baseSharePercent: 45,
                },
              }),
            ),
          },
        },
      },
    }

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).toContain('zu 55 %')
  })

  it('verwendet den übergebenen Erstellzeitpunkt deterministisch', () => {
    const appData = buildFixtureAppData()
    const context = {
      ...buildFixtureTenantStatementContext(appData),
      generatedAt: new Date('2000-01-02T10:00:00.000Z'),
    }

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).toContain('02.01.2000')
  })

  it('weist CO2 getrennt von der Heizkostensumme aus', () => {
    const appData = buildFixtureAppData('case-12-co2-split')
    const context = buildFixtureTenantStatementContext(appData)
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    const expectedHeatingCents =
      tenant.costBreakdown.heatingBaseCents +
      tenant.costBreakdown.heatingConsumptionCents +
      tenant.costBreakdown.hotWaterCents

    const doc = buildTenantStatement(context)
    const summary = (doc.content as unknown as Array<Record<string, unknown>>)
      .map((item) => item.table)
      .find(
        (table) =>
          typeof table === 'object' &&
          table !== null &&
          JSON.stringify(table).includes('Ihre Heizkosten'),
      ) as { body: Array<Array<{ text?: string }>> }

    expect(summary.body[0]?.[1]?.text).toBe(
      (expectedHeatingCents / 100)
        .toLocaleString('de-DE', {
          style: 'currency',
          currency: 'EUR',
        })
        .replace('\u00a0', ' '),
    )
    expect(JSON.stringify(summary.body)).toContain('Ihr CO2-Kostenanteil')
  })

  it('zeigt den Schätzhinweis bei geschätzten Verbrauchseinheiten', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    appData.billingData.occupancyPeriods =
      appData.billingData.occupancyPeriods.map((occupancy) => ({
        ...occupancy,
        consumptionUnitsEstimated: true,
      }))
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).toContain(
      'Verbrauchseinheiten (HKV) wurden geschätzt',
    )
  })

  it('lässt das Anschreiben weg, wenn es nicht aktiv ist, und zeigt keine allgemeinen Hinweise ohne Text', () => {
    const appData = buildFixtureAppData()
    appData.billingData.billingPeriods = appData.billingData.billingPeriods.map(
      (period) => ({
        ...period,
        coverLetter: { active: false, text: 'sollte nicht erscheinen' },
        notes: undefined,
      }),
    )
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).not.toContain('sollte nicht erscheinen')
  })

  it('zeigt keine Bankverbindung ohne IBAN', () => {
    const appData = buildFixtureAppData()
    appData.masterData.ownerCompanies = appData.masterData.ownerCompanies.map(
      (ownerCompany) => ({ ...ownerCompany, bankAccount: undefined }),
    )
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)

    expect(JSON.stringify(doc.content)).not.toContain('Bankverbindung')
    const footer = doc.footer as (
      currentPage: number,
      pageCount: number,
    ) => { text: string }
    expect(footer(2, 4).text).not.toContain('·  ·')
  })
})
