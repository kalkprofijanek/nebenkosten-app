import { describe, expect, it } from 'vitest'
import { buildTenantStatement } from '../src/tenant-statement'
import { MissingShippingAddressError } from '../src/contracts'
import { formatEuroCents } from '../src/format'
import { SECTION_35A_NOTICE } from '../src/legal-texts'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

describe('buildTenantStatement', () => {
  it('druckt den eingefrorenen Messnachweis ohne spätere Live-Ablesungen', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const measurement = {
      meterId: 'meter',
      meterNumber: 'SNAPSHOT-WMZ',
      startReadingId: 'start',
      startReadingDate: '2026-01-01',
      startBoundary: 'start_of_day' as const,
      startValue: '1000',
      endReadingId: 'end',
      endReadingDate: '2026-06-30',
      endBoundary: 'end_of_day' as const,
      endValue: '1400',
      unit: 'kWh' as const,
      kwh: '400',
    }
    const meteringTrace = {
      year: 2026,
      billingPeriodId: context.billingPeriod.id,
      totalKwh: '400',
      circuits: [
        {
          heatingCircuitId: 'circuit',
          buildingId: 'building',
          totalKwh: '400',
          occupancies: [
            {
              occupancyId: context.occupancyPeriod.id,
              unitId: context.unit.id,
              from: '2026-01-01',
              to: '2026-06-30',
              kwh: '400',
              meters: [measurement],
            },
          ],
        },
      ],
    }
    const document = buildTenantStatement({
      ...context,
      calculation: { ...context.calculation, meteringTrace },
    })
    const serialized = JSON.stringify(document.content)
    expect(serialized).toContain('SNAPSHOT-WMZ')
    expect(serialized).toContain('400 kWh')
    expect(serialized).toContain('Tagesende')
    expect(serialized).toContain('1000')
    expect(serialized).toContain('1400')
  })

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
    expect(footer(1, 3).text).toContain(
      ['DE89 3704', ' 0044 0532 0130 00'].join(''),
    )
  })

  it('bewahrt die vollständige PDF-Dokumentdefinition', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const document = buildTenantStatement(context)
    const footer = document.footer as (
      currentPage: number,
      pageCount: number,
    ) => unknown

    expect({ ...document, footer: footer(1, 3) }).toMatchSnapshot(
      'complete tenant statement definition',
    )
  })

  it('setzt die Anrede in den Brieftext statt ins Adressfeld', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const doc = buildTenantStatement({
      ...context,
      billingPeriod: { ...context.billingPeriod, coverLetter: null },
    })
    const content = doc.content as Array<{ stack?: unknown[]; text?: unknown }>
    const addressStack = content.find(
      (item) =>
        Array.isArray(item.stack) &&
        item.stack.includes(context.tenancy.shippingAddressStreet),
    )
    expect(JSON.stringify(addressStack ?? {})).not.toContain('Sehr geehrte')
    expect(
      content.some(
        (item) =>
          typeof item.text === 'string' && /^Sehr geehrte.*,$/.test(item.text),
      ),
    ).toBe(true)
  })

  it('nennt bei Teilzeitraum den eigenen Nutzungszeitraum', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const start = context.billingPeriod.periodStart
    const from = `${start.slice(0, 4)}-03-15`
    const doc = buildTenantStatement({
      ...context,
      occupancyPeriod: { ...context.occupancyPeriod, from },
    })
    expect(JSON.stringify(doc.content)).toContain(
      `Ihr Nutzungszeitraum: 15.03.${start.slice(0, 4)}`,
    )
  })

  it('interpoliert das Anschreiben mit den Mieterdaten', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain(String(context.billingPeriod.year))
    expect(serialized).not.toContain('{{jahr}}')
  })

  it('wirft MissingShippingAddressError ganz ohne verwendbare Anschrift', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const patchedContext = {
      ...context,
      property: { ...context.property, address: null },
      tenancy: { ...context.tenancy, shippingAddressStreet: null },
    }

    expect(() => buildTenantStatement(patchedContext)).toThrow(
      MissingShippingAddressError,
    )
  })

  it('adressiert nach Auszug ohne neue Anschrift an die bisherige', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const patchedContext = {
      ...context,
      occupancyPeriod: {
        ...context.occupancyPeriod,
        to: context.billingPeriod.periodStart,
        legacyUnmapped: [
          { path: ['strasse'], value: 'Am Altbau' },
          { path: ['hausnummer'], value: '3' },
        ],
      },
      tenancy: {
        ...context.tenancy,
        shippingAddressStreet: null,
        shippingAddressPostalCodeAndCity: null,
      },
    }

    expect(
      JSON.stringify(buildTenantStatement(patchedContext).content),
    ).toContain('Am Altbau 3')
  })

  it('adressiert Bewohner ohne Versandadresse an ihre Hausanschrift', () => {
    const appData = buildFixtureAppData()
    const context = buildFixtureTenantStatementContext(appData)
    const patchedContext = {
      ...context,
      occupancyPeriod: {
        ...context.occupancyPeriod,
        to: null,
        legacyUnmapped: [
          { path: ['strasse'], value: 'Am Fiktivhof' },
          { path: ['hausnummer'], value: '9' },
        ],
      },
      tenancy: {
        ...context.tenancy,
        shippingAddressStreet: null,
        shippingAddressPostalCodeAndCity: null,
      },
    }

    const serialized = JSON.stringify(
      buildTenantStatement(patchedContext).content,
    )
    expect(serialized).toContain('Am Fiktivhof 9')
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
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain(
      'CO2-Kostenaufteilung (Angaben nach § 7 Abs. 3 CO2KostAufG)',
    )
    expect(serialized).toContain('CO2-Emissionen im Abrechnungszeitraum')
    expect(serialized).toContain('kg CO2/m²·a')
    expect(serialized).toMatch(/Stufe \d+/)
    expect(serialized).toContain('Ihr Anteil an den CO2-Kosten')
    expect(serialized).toContain('wurde von den Heizkosten abgezogen')
  })

  it('zeigt den CO2-Ausweis auch bei emissionsfreier Heizung mit null Kosten', () => {
    const appData = buildFixtureAppData('case-08-heat-pump')
    const context = buildFixtureTenantStatementContext(appData)

    const doc = buildTenantStatement(context)
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain('CO2-Kostenaufteilung')
    expect(serialized).toContain('Keine CO2-Kosten nach BEHG angefallen')
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

  it('verwendet die Heizkreis-Zuordnung des Nutzungszeitraums für Split und CO2-Ausweis', () => {
    const appData = buildFixtureAppData('case-12-co2-split')
    const traceBuildingId = appData.billingData.heatingCircuits[0]!.buildingId
    const scopedAppData = {
      ...appData,
      masterData: {
        ...appData.masterData,
        units: appData.masterData.units.map((unit) => ({
          ...unit,
          buildingId: undefined,
        })),
      },
      billingData: {
        ...appData.billingData,
        occupancyPeriods: appData.billingData.occupancyPeriods.map(
          (occupancy) => ({
            ...occupancy,
            costScope: {
              kind: 'building' as const,
              buildingId: traceBuildingId,
            },
          }),
        ),
      },
    }
    const originalContext = buildFixtureTenantStatementContext(scopedAppData)
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
    const serialized = JSON.stringify(doc.content)

    expect(serialized).toContain('zu 55 %')
    expect(serialized).toContain('CO2-Kostenaufteilung')
  })

  it('verweigert Heizkosten ohne passenden Heizkreis-Nachweis', () => {
    const appData = buildFixtureAppData('case-12-co2-split')
    const originalContext = buildFixtureTenantStatementContext(appData)
    const context = {
      ...originalContext,
      calculation: {
        ...originalContext.calculation,
        heating: {
          ...originalContext.calculation.heating,
          trace: {
            ...originalContext.calculation.heating.trace,
            circuits: [],
          },
        },
      },
    }

    expect(() => buildTenantStatement(context)).toThrow(/Heizkreis-Nachweis/)
  })

  it('verweigert einen zugeordneten Heizkreis ohne CO2-Nachweis auch bei null Kosten', () => {
    const appData = buildFixtureAppData()
    const originalContext = buildFixtureTenantStatementContext(appData)
    const context = {
      ...originalContext,
      unit: { ...originalContext.unit, buildingId: 'building-without-trace' },
      calculation: {
        ...originalContext.calculation,
        heating: {
          ...originalContext.calculation.heating,
          trace: {
            ...originalContext.calculation.heating.trace,
            circuits: [],
          },
        },
      },
    }

    expect(() => buildTenantStatement(context)).toThrow(/CO2-Nachweis/)
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
    expect(JSON.stringify(doc.content)).toContain(
      'darin enthaltene CO2-Kosten (gesondert verteilt)',
    )
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
      'Ihr Verbrauch wurde geschätzt (§ 9a HeizKV).',
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

  it('setzt die Anschrift in die Prüfbox der Versanddienste (Fensterkuvert)', () => {
    const definition = buildTenantStatement(
      buildFixtureTenantStatementContext(buildFixtureAppData()),
    )
    const content = definition.content as Array<{
      absolutePosition?: { x: number; y: number }
      stack?: unknown[]
      margin?: number[]
      style?: string
    }>
    const mm = (pt: number) => pt / 2.835
    const recipient = content.find(
      (item) => item.stack && item.absolutePosition?.x === 71,
    )!
    const top = mm(recipient.absolutePosition!.y)
    const left = mm(recipient.absolutePosition!.x)
    const bottom = top + mm(recipient.stack!.length * 12)
    expect(left).toBeGreaterThanOrEqual(22)
    expect(top).toBeGreaterThanOrEqual(54)
    expect(bottom).toBeLessThanOrEqual(88)
    const title = content.find((item) => item.style === 'title')!
    expect(mm(46 + (title.margin?.[1] ?? 0))).toBeGreaterThan(92)
  })
  it('weist den Lohnanteil nach § 35a EStG je Kostenart aus', () => {
    const appData = buildFixtureAppData('case-01-full-year')
    const category = appData.billingData.costCategories[0]!
    category.laborSharePercent = 40
    const context = buildFixtureTenantStatementContext(appData)
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    const laborCents = tenant.section35a!.totalCents
    expect(laborCents).toBeGreaterThan(0)

    const serialized = JSON.stringify(buildTenantStatement(context).content)

    expect(serialized).toContain('Bescheinigung nach § 35a EStG')
    expect(serialized).toContain(category.statementText ?? category.label)
    expect(serialized).toContain('40 %')
    expect(serialized).toContain(formatEuroCents(laborCents))
    expect(serialized).toContain(SECTION_35A_NOTICE)
  })

  it('lässt die § 35a-Bescheinigung ohne Lohnanteil weg', () => {
    const appData = buildFixtureAppData('case-01-full-year')
    const context = buildFixtureTenantStatementContext(appData)

    const serialized = JSON.stringify(buildTenantStatement(context).content)

    expect(serialized).not.toContain('§ 35a EStG')
  })

  it('verträgt Berechnungsstände ohne § 35a-Angaben', () => {
    const appData = buildFixtureAppData('case-01-full-year')
    appData.billingData.costCategories[0]!.laborSharePercent = 40
    const context = buildFixtureTenantStatementContext(appData)
    for (const tenant of context.calculation.tenants) delete tenant.section35a

    const serialized = JSON.stringify(buildTenantStatement(context).content)

    expect(serialized).not.toContain('§ 35a EStG')
  })
})
