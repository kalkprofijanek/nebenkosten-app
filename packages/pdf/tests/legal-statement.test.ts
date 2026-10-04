import { describe, expect, it } from 'vitest'
import type { CalculationOutput } from '@nebenkosten/core'
import { buildTenantStatement } from '../src/tenant-statement'
import { buildCombinedCostStatement } from '../src/combined-cost-statement'
import {
  co2Table,
  fuelAccountTable,
  heatingCompilationTable,
  propertyUnitLabel,
  scopeLabel,
} from '../src/heating-summary'
import { addDaysIso, formatQuantityUnit, formatUnitPrice } from '../src/format'
import {
  buildFixtureAppData,
  buildFixtureCombinedContext,
  buildFixtureTenantStatementContext,
} from './fixture'

type TenantContext = ReturnType<typeof buildFixtureTenantStatementContext>

function text(document: { content: unknown }): string {
  return JSON.stringify(document.content)
}

function withTenant(
  context: TenantContext,
  patch: Partial<CalculationOutput['tenants'][number]>,
): TenantContext {
  return {
    ...context,
    calculation: {
      ...context.calculation,
      tenants: context.calculation.tenants.map((tenant) =>
        tenant.id === context.occupancyPeriod.id
          ? { ...tenant, ...patch }
          : tenant,
      ),
    },
  }
}

function parseEuro(value: string): number {
  return Math.round(
    Number(value.replace(' €', '').split('.').join('').replace(',', '.')) * 100,
  )
}

describe('Einzelabrechnung – formelle Vollständigkeit', () => {
  it('druckt die Kostentabelle mit Gesamtkosten, Schlüssel, Nennern und eigenen Einheiten', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const serialized = text(buildTenantStatement(context))

    for (const header of [
      'Gesamtkosten (umlagefähig)',
      'Schlüssel',
      'Gesamt-einheiten',
      'Ihre Einheiten',
      'Ihr Anteil',
      'Summe Ihrer Betriebskosten',
    ])
      expect(serialized).toContain(header)
    expect(serialized).toContain(propertyUnitLabel(context.property))
    expect(serialized).toContain('Abrechnungseinheit Betriebskosten')
    expect(serialized).not.toContain('Wohnanlage gesamt')
    expect(serialized).toContain('Ihre Nutzungstage')
    expect(serialized).toContain(
      `${context.calculation.periodDays} von ${context.calculation.periodDays} Tagen`,
    )
    expect(serialized).toContain('Ihre Wohnfläche')
    expect(serialized).toContain('Von Ihnen geleistete Vorauszahlungen')
    expect(serialized).toContain('nach Wohnfläche')
  })

  it('weist bei Teilzeiträumen die Nutzungstage in den eigenen Einheiten aus', () => {
    const appData = buildFixtureAppData('case-02-tenant-change')
    const context = buildFixtureTenantStatementContext(appData)
    const tenant = context.calculation.tenants.find(
      ({ id }) => id === context.occupancyPeriod.id,
    )!
    const serialized = text(buildTenantStatement(context))

    expect(serialized).toContain(
      `${tenant.days} von ${context.calculation.periodDays} Tagen`,
    )
    expect(serialized).toContain(
      `× ${tenant.days}/${context.calculation.periodDays} Tage`,
    )
    expect(serialized).toContain(
      'Ihre Nutzungstage : Tage des Abrechnungszeitraums',
    )
  })

  it('bleibt mit älteren Rechenständen ohne Umlage-Nachweis lesbar', () => {
    const context = buildFixtureTenantStatementContext(buildFixtureAppData())
    const legacy = {
      ...context,
      calculation: {
        ...context.calculation,
        operatingPositions: undefined,
        tenants: context.calculation.tenants.map((tenant) => ({
          ...tenant,
          days: undefined,
          timeFactor: undefined,
          ownBasis: undefined,
        })),
      },
    }
    const serialized = text(buildTenantStatement(legacy))

    expect(serialized).toContain('Kostenart')
    expect(serialized).not.toContain('Gesamt-einheiten')
    expect(serialized).toContain(
      `${context.calculation.periodDays} von ${context.calculation.periodDays} Tagen`,
    )
  })

  it('stellt die Heizkosten des Heizkreises nach § 7 Abs. 2 HeizKV zusammen', () => {
    const context = buildFixtureTenantStatementContext(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const serialized = text(buildTenantStatement(context))

    for (const expected of [
      'Zusammenstellung für Ihren Heizkreis',
      'Brennstoffkonto',
      'Anfangsbestand',
      '+ Lieferung',
      '− Endbestand',
      '= Verbrauch (FIFO-Bewertung)',
      '− darin enthaltene CO2-Kosten (gesondert verteilt)',
      '+ Betriebsstrom der Heizungsanlage',
      '+ Betriebskosten der Heizungsanlage',
      '= Heizkosten des Heizkreises',
      'Grundkosten 30 %',
      'm² beheizte Fläche',
      'Verbrauchskosten 70 %',
      '€ je Einheit',
      'Ihre Heizkosten-Aufschlüsselung',
      'nach erfasstem Verbrauch laut Ablesung',
    ])
      expect(serialized).toContain(expected)
    expect(serialized).not.toContain('Warmwasser')
    expect(serialized).not.toContain('zentrale Warmwasserbereitung')
    expect(serialized).not.toContain('Heizkostenverteiler-Ablesung')
    expect(serialized).toContain(' l"')
  })

  it('zeigt Warmwasser nur bei zentraler Warmwasserbereitung', () => {
    const context = buildFixtureTenantStatementContext(
      buildFixtureAppData('case-10-central-hot-water'),
    )
    const serialized = text(buildTenantStatement(context))

    expect(serialized).toContain('Kosten der Warmwasserbereitung')
    expect(serialized).toContain('Warmwasser:')
    expect(serialized).not.toContain(
      'Eine zentrale Warmwasserbereitung besteht nicht.',
    )
  })

  it('benennt Wohnungs-Wärmemengenzähler und Wohnfläche passend zur Konfiguration', () => {
    const original = buildFixtureTenantStatementContext(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const circuit = original.calculation.heating.trace.circuits[0]!
    const context = withTenant(
      {
        ...original,
        calculation: {
          ...original.calculation,
          meteringTrace: {
            year: original.billingPeriod.year,
            billingPeriodId: original.billingPeriod.id,
            totalKwh: '1000',
            circuits: [
              {
                heatingCircuitId: circuit.heatingCircuitId ?? 'circuit',
                buildingId: circuit.buildingId,
                totalKwh: '1000',
                occupancies: [],
              },
            ],
          },
          heating: {
            ...original.calculation.heating,
            trace: {
              ...original.calculation.heating.trace,
              circuits: [
                {
                  ...circuit,
                  split: { ...circuit.split, baseAreaBasis: 'usable_area' },
                },
              ],
            },
          },
        },
      },
      {
        ownBasis: {
          buildingId: circuit.buildingId,
          usableAreaSqm: 80,
          heatedAreaSqm: 75,
          persons: 2,
          consumption: 400,
          consumptionUnit: 'kWh',
        },
      },
    )
    const serialized = text(buildTenantStatement(context))

    expect(serialized).toContain('Wohnungs-Wärmemengenzähler')
    expect(serialized).toContain('nach Wohnfläche (Grundkosten)')
    expect(serialized).toContain('€ je kWh × 400,00 kWh')
    expect(serialized).toContain('80,00 m² Wohnfläche')
    expect(serialized).toContain('Ihre beheizte Fläche')
    expect(serialized).not.toContain('Heizkostenverteiler')
  })

  it('nennt den Schätzgrund und die Kürzung nach § 12 HeizKV', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    // Nur u1 geschätzt und mit kleiner Fläche: unter 25 % (§ 9a Abs. 2).
    appData.masterData.units = appData.masterData.units.map((unit) =>
      unit.id === 'u1'
        ? { ...unit, heatedAreaSqm: { value: 10, unit: 'm2' as const } }
        : unit,
    )
    appData.billingData.occupancyPeriods =
      appData.billingData.occupancyPeriods.map((occupancy) =>
        occupancy.unitId === 'u1'
          ? {
              ...occupancy,
              consumptionUnitsEstimated: true,
              consumptionUnitsEstimateReason: 'Zähler war nicht ablesbar',
              applySection12Reduction: true,
            }
          : occupancy,
      )
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )

    expect(serialized).toContain(
      'Grund der Schätzung: Zähler war nicht ablesbar',
    )
    expect(serialized).toContain('× 85 % (Kürzung § 12 HeizKV)')
    expect(serialized).not.toContain('§ 9a Abs. 2 HeizKV')
  })

  it('verteilt bei über 25 % Schätzung nur nach Fläche, ohne § 12-Kürzung', () => {
    const appData = buildFixtureAppData('case-06-heating-oil-fifo')
    appData.billingData.occupancyPeriods =
      appData.billingData.occupancyPeriods.map((occupancy) => ({
        ...occupancy,
        consumptionUnitsEstimated: true,
        consumptionUnitsEstimateReason: 'Zähler war nicht ablesbar',
        applySection12Reduction: true,
      }))
    const serialized = text(
      buildTenantStatement(buildFixtureTenantStatementContext(appData)),
    )

    expect(serialized).toContain(
      'Verbrauchskosten: entfallen (§ 9a Abs. 2 HeizKV, Verteilung nur nach Fläche)',
    )
    expect(serialized).toContain(
      'Heizkostenverteilung (§ 9a Abs. 2 HeizKV): Für 100 % der beheizten Fläche',
    )
    expect(serialized).not.toContain('Kürzung § 12 HeizKV')
  })

  it('fordert eine Nachzahlung mit Frist, IBAN und Verwendungszweck an', () => {
    const original = buildFixtureTenantStatementContext(buildFixtureAppData())
    const context = withTenant(original, { balanceCents: 12_345 })
    const serialized = text(buildTenantStatement(context))

    expect(serialized).toContain('Bitte überweisen Sie den Nachzahlungsbetrag')
    expect(serialized).toContain('bis zum 14.02.2026')
    expect(serialized).toContain(['DE89 3704', ' 0044 0532 0130 00'].join(''))
    expect(serialized).toContain(
      `Verwendungszweck „NK ${original.billingPeriod.year} ${original.unit.label}“`,
    )

    const dispatched = {
      ...context,
      billingPeriod: {
        ...context.billingPeriod,
        dispatchDate: '2026-03-01',
        notes: { additionalPayment: 'Zusatz zur Nachzahlung' },
      },
    }
    const dispatchedText = text(buildTenantStatement(dispatched))
    expect(dispatchedText).toContain('bis zum 31.03.2026')
    expect(dispatchedText).toContain('Zusatz zur Nachzahlung')
  })

  it('erläutert Guthaben und ausgeglichene Abrechnungen', () => {
    const original = buildFixtureTenantStatementContext(buildFixtureAppData())
    const credit = withTenant(original, { balanceCents: -500 })
    const creditText = text(
      buildTenantStatement({
        ...credit,
        billingPeriod: {
          ...credit.billingPeriod,
          notes: { credit: 'Zusatz zum Guthaben' },
        },
      }),
    )
    expect(creditText).toContain(
      'überweisen wir Ihnen innerhalb von vier Wochen bzw. verrechnen es mit der nächsten Miete',
    )
    expect(creditText).toContain('Zusatz zum Guthaben')

    const balanced = text(
      buildTenantStatement(withTenant(original, { balanceCents: 0 })),
    )
    expect(balanced).toContain('weder eine Nachzahlung noch ein Guthaben')
  })

  it('belehrt über die Einwendungsfrist ohne Schriftform-Vorgabe', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(buildFixtureAppData()),
      ),
    )
    expect(serialized).toContain(
      'bis zum Ablauf des zwölften Monats nach Zugang der Abrechnung',
    )
    expect(serialized).toContain('§ 556 Abs. 3 BGB')
    expect(serialized).toContain('nach vorheriger Terminvereinbarung')
    expect(serialized).not.toMatch(/schriftlich/i)
    expect(serialized).toContain(
      'Bei Ein- oder Auszug im Abrechnungsjahr werden die Betriebskosten nach Kalendertagen anteilig berechnet. Bei den Heizkosten erfolgt die Aufteilung bei Nutzerwechsel nach § 9b HeizKV: Grundkosten nach Kalendertagen, Verbrauchskosten nach dem erfassten Verbrauch.',
    )
    expect(serialized).toContain(
      'Leerstandszeiten entfallende Kosten trägt der Vermieter',
    )
  })

  it('enthält die Verbrauchsinformation nach § 6a HeizKV', () => {
    const serialized = text(
      buildTenantStatement(
        buildFixtureTenantStatementContext(
          buildFixtureAppData('case-12-co2-split'),
        ),
      ),
    )
    expect(serialized).toContain(
      'Abrechnungs- und Verbrauchsinformationen (§ 6a HeizKV)',
    )
    expect(serialized).toContain('Eingesetzte Energieträger Ihres Heizkreises')
    expect(serialized).toContain(
      'Heizoel 100 % (Anteil am Energieeinsatz in kWh)',
    )
    // Der Heizkreis-Mittelwert ist kein normierter Durchschnittsnutzer und
    // wird nicht als solcher Vergleich ausgegeben.
    expect(serialized).toContain('Mittlerer Verbrauch im Heizkreis')
    expect(serialized).not.toContain('Durchschnitt Ihres Heizkreises')
    expect(serialized).not.toContain('Durchschnittsnutzer')
    expect(serialized).not.toContain('Durchschnittlicher vergleichbarer Nutzer')
    expect(serialized).toContain('Verbraucherzentralen')
    expect(serialized).toContain(
      'Vergleich mit dem vorhergehenden Abrechnungszeitraum',
    )
    expect(serialized).toContain(
      'Ein grafischer, witterungsbereinigter Vergleich mit dem vorhergehenden Abrechnungszeitraum ist nicht möglich, weil für diesen Zeitraum keine Verbrauchsdaten vorliegen (Eigentümer- bzw. Abrechnungswechsel).',
    )
    expect(serialized).toContain(
      'gesetzlichen Steuern und Abgaben (Umsatzsteuer, Energiesteuer, ggf. CO2-Kosten nach BEHG)',
    )
    expect(serialized).toContain(
      'Allgemeine Verbraucherschlichtungsstelle des Zentrums für Schlichtung e. V., Straßburger Straße 8, 77694 Kehl (www.verbraucher-schlichter.de)',
    )
    expect(serialized).toContain('nimmt daran nicht teil.')
  })

  it('verzichtet ohne Heizkreis auf Heiz-, CO2- und Verbrauchsangaben', () => {
    const appData = buildFixtureAppData()
    appData.masterData.units = appData.masterData.units.map((unit) => ({
      ...unit,
      buildingId: null,
    }))
    const original = buildFixtureTenantStatementContext(appData)
    const context = {
      ...original,
      calculation: {
        ...original.calculation,
        heating: {
          ...original.calculation.heating,
          trace: { ...original.calculation.heating.trace, circuits: [] },
        },
      },
    }
    const serialized = text(buildTenantStatement(context))
    expect(serialized).not.toContain('§ 6a HeizKV')
    expect(serialized).not.toContain('CO2-Kostenaufteilung')
    expect(serialized).toContain('ohne Gebäudezuordnung')
  })
})

describe('Gesamtabrechnung – interne Fassung und Fassung für Mieter', () => {
  it('trennt die interne Fassung von der Fassung für Mieter', () => {
    const appData = buildFixtureAppData()
    const internal = text(
      buildCombinedCostStatement(buildFixtureCombinedContext(appData)),
    )
    const tenantContext = buildFixtureCombinedContext(appData, 'tenant')
    const forTenants = buildCombinedCostStatement(tenantContext)
    const tenantText = text(forTenants)

    expect(internal).toContain('Mieter-Salden')
    expect(internal).toContain('Mandatsreferenz')
    expect(tenantText).toContain('Fassung für Mieter')
    expect(tenantText).not.toContain('Mieter-Salden')
    expect(tenantText).not.toContain('Mandatsreferenz')
    for (const tenancy of tenantContext.tenancies) {
      if (tenancy.mandateReference)
        expect(tenantText).not.toContain(tenancy.mandateReference)
    }
    const footer = forTenants.footer as (
      currentPage: number,
      pageCount: number,
    ) => { text: string }
    expect(footer(1, 2).text).toContain('Fassung für Mieter')
    expect(footer(1, 2).text).toContain('Seite 1/2')
  })

  it('nennt Vermieter, Zeitraum und je Kostenart brutto, nicht umlagefähig, umlagefähig', () => {
    const context = buildFixtureCombinedContext(buildFixtureAppData(), 'tenant')
    const serialized = text(buildCombinedCostStatement(context))
    for (const expected of [
      'Vermieter',
      'Abrechnungszeitraum',
      'Brutto',
      'nicht umlagefähig',
      'umlagefähig',
      'Schlüssel',
      'Gesamt-einheiten',
      propertyUnitLabel(context.property),
      'Abrechnungseinheit Betriebskosten',
      'nach Wohnfläche',
      ' m²',
    ])
      expect(serialized).toContain(expected)
  })

  it('druckt eine Überleitung, deren Zeilen die verteilten Mieterkosten ergeben', () => {
    const context = buildFixtureCombinedContext(
      buildFixtureAppData('case-03-vacancy'),
      'tenant',
    )
    const doc = buildCombinedCostStatement(context)
    const reconciliation = (
      doc.content as unknown as Array<Record<string, unknown>>
    )
      .map((item) => item.table as { body: unknown[][] } | undefined)
      .find((table) =>
        JSON.stringify(table ?? {}).includes('= auf Mieter verteilt'),
      )!
    const amounts = reconciliation.body.map((row) => {
      const cell = row[1] as { text: string }
      return parseEuro(cell.text)
    })
    const printedSum = amounts.at(-1)!
    const lines = amounts.slice(0, -1)
    const tenantTotal = context.calculation.tenants
      .filter(({ isVacancy }) => !isVacancy)
      .reduce((sum, tenant) => sum + tenant.shareCents, 0)

    expect(lines.reduce((sum, cents) => sum + cents, 0)).toBe(printedSum)
    expect(printedSum).toBe(tenantTotal)
    expect(JSON.stringify(reconciliation)).toContain(
      'Leerstandsanteil (trägt der Vermieter)',
    )
    expect(JSON.stringify(reconciliation)).toContain(
      'CO2-Kosten Vermieteranteil',
    )
    expect(text(doc)).toContain('Leerstandsanteil gesamt (Vermieter)')
  })

  it('weist direkt zugeordnete und nicht zuordenbare Heizkosten in der Überleitung aus', () => {
    const direct = text(
      buildCombinedCostStatement(
        buildFixtureCombinedContext(
          buildFixtureAppData('case-13-direct-costs'),
        ),
      ),
    )
    expect(direct).toContain('direkt zugeordnete Kosten')

    const unassignedContext = buildFixtureCombinedContext(
      buildFixtureAppData('case-14-missing-assignment'),
    )
    const unassigned = text(buildCombinedCostStatement(unassignedContext))
    if (unassignedContext.calculation.heating.unallocatedLandlordCents !== 0)
      expect(unassigned).toContain('nicht zuordenbare Heizungs-Betriebskosten')
    expect(unassigned).toContain('über Heizkosten')
  })

  it('zeigt Heizkosten-Zusammenstellung und CO2-Tabelle je Heizkreis', () => {
    const context = buildFixtureCombinedContext(
      buildFixtureAppData('case-05-multiple-circuits'),
    )
    const serialized = text(buildCombinedCostStatement(context))
    const circuits = context.calculation.heating.trace.circuits.length

    expect(
      serialized.split('Heizkosten – Zusammenstellung Heizkreis').length - 1,
    ).toBe(circuits)
    expect(serialized.split('CO2-Kostenaufteilung').length - 1).toBe(circuits)
  })

  it('zeigt die Betriebsstrom-Umbuchung als Netto-null-Zeilen', () => {
    const original = buildFixtureCombinedContext(
      buildFixtureAppData('case-06-heating-oil-fifo'),
    )
    const categoryId = 'strom'
    const context = {
      ...original,
      calculation: {
        ...original.calculation,
        operatingPositions: [
          {
            costCategoryId: categoryId,
            label: 'Allgemeinstrom',
            betrkvCategory: '§2 Nr. 11',
            allocationKey: 'usable_area',
            scope: null,
            grossCents: 50_000,
            nonAllocableCents: 0,
            allocableCents: 50_000,
            operatingElectricityDeductedCents: 4_000,
            distributedCents: 46_000,
            distribution: 'key' as const,
            denominator: 200,
            denominatorUnit: 'm²' as const,
            vacancyCents: 0,
          },
        ],
        heating: {
          ...original.calculation.heating,
          trace: {
            ...original.calculation.heating.trace,
            circuits: original.calculation.heating.trace.circuits.map(
              (circuit) => ({
                ...circuit,
                operatingElectricity: {
                  intendedCents: 4_000,
                  movedCents: 4_000,
                  uncoveredCents: 0,
                },
              }),
            ),
          },
        },
      },
    }
    const serialized = text(buildCombinedCostStatement(context))

    expect(serialized).toContain(
      '− Betriebsstrom-Umbuchung aus „Allgemeinstrom“',
    )
    expect(serialized).toContain('+ Betriebsstrom in den Heizkosten')
    expect(serialized).toContain('-40,00 €')
  })

  it('verwendet für ältere Rechenstände die bisherige Kostenliste', () => {
    const original = buildFixtureCombinedContext(buildFixtureAppData())
    const serialized = text(
      buildCombinedCostStatement({
        ...original,
        calculation: { ...original.calculation, operatingPositions: undefined },
      }),
    )
    expect(serialized).toContain('Bezeichnung')
    expect(serialized).toContain('= auf Mieter verteilt')
  })
})

describe('Bausteine der Heizkosten-Zusammenstellung', () => {
  const context = buildFixtureTenantStatementContext(
    buildFixtureAppData('case-06-heating-oil-fifo'),
  )
  const circuit = context.calculation.heating.trace.circuits[0]!

  it('weist Energiekosten ohne Mengenangabe und fehlende Energiequellen aus', () => {
    const direct = JSON.stringify(
      fuelAccountTable(context.appData, {
        ...circuit,
        energySources: circuit.energySources.map((source) => ({
          ...source,
          method: 'direct_cost_without_quantity' as const,
        })),
      }),
    )
    expect(direct).toContain('Energiekosten laut Rechnungen')

    const withoutOpening = JSON.stringify(
      fuelAccountTable(context.appData, {
        ...circuit,
        energySources: circuit.energySources.map((source) => ({
          ...source,
          lots: source.lots.filter(({ kind }) => kind !== 'opening_stock'),
        })),
      }),
    )
    expect(withoutOpening).toContain('Anfangsbestand')

    expect(
      JSON.stringify(
        fuelAccountTable(context.appData, { ...circuit, energySources: [] }),
      ),
    ).toContain('keine Energiequellen erfasst')
  })

  it('zeigt eine Rundungsdifferenz nur, wenn sie anfällt', () => {
    const table = JSON.stringify(
      heatingCompilationTable({
        ...circuit,
        reconciliation: {
          ...circuit.reconciliation,
          roundingDifferenceCents: 1,
        },
      }),
    )
    expect(table).toContain('± Rundungsdifferenz')
  })

  it('kennzeichnet manuell festgelegte CO2-Werte', () => {
    const table = JSON.stringify(
      co2Table(
        context.appData,
        {
          ...circuit,
          co2: {
            ...circuit.co2,
            mode: 'manual',
            pricePerTonCents: null,
            tier: 'manual',
            totalCents: 1_000,
          },
        },
        250,
      ),
    )
    expect(table).toContain('manuell festgelegt')
    expect(table).toContain('"manuell"')
    expect(table).toContain('Ihr Anteil an den CO2-Kosten')
  })

  it('benennt Abrechnungseinheiten und Formate', () => {
    expect(scopeLabel(context.appData, null)).toBe('Wohnanlage gesamt')
    expect(
      scopeLabel(context.appData, { kind: 'property' }, context.property),
    ).toBe(propertyUnitLabel(context.property))
    expect(propertyUnitLabel({ ...context.property, address: null })).toBe(
      'Wohnanlage gesamt',
    )
    expect(
      propertyUnitLabel({
        ...context.property,
        address: null,
        internalNumber: ' OBJ-7 ',
      }),
    ).toBe('Objekt OBJ-7')
    expect(
      scopeLabel(context.appData, { kind: 'house', houseKey: 'AW1' }),
    ).toBe('Haus AW1')
    expect(
      scopeLabel(context.appData, { kind: 'building', buildingId: 'fehlt' }),
    ).toBe('Gebäude fehlt')
    expect(addDaysIso('2026-01-15', 30)).toBe('2026-02-14')
    expect(formatQuantityUnit('m3')).toBe('m³')
    expect(formatQuantityUnit(null)).toBe('')
    expect(formatQuantityUnit('sonstiges')).toBe('sonstiges')
    expect(formatUnitPrice(123.456, 'm²')).toBe('1,2346 € je m²')
  })
})
