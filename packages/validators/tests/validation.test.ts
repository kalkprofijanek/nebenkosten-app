import { describe, expect, it } from 'vitest'
import type { ValidationIssue } from '@nebenkosten/schema'
import { issueKey, validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const codes = (data: unknown) =>
  validateBillingPeriod(data, 'period-1').issues.map(({ code }) => code)

describe('issueKey', () => {
  it('identifiziert dieselbe konkrete Issue unabhängig vom Anzeigetext', () => {
    const issue: ValidationIssue = {
      severity: 'warning',
      code: 'costs.negative_amount',
      area: 'costs',
      title: 'A',
      path: ['billingData', 'costEntries', 2],
      entity: { type: 'CostEntry', id: 'entry-1' },
    }
    expect(issueKey(issue)).toBe(
      issueKey({ ...issue, title: 'Anderer Text', detail: 'Neu' }),
    )
    expect(issueKey(issue)).not.toBe(
      issueKey({ ...issue, entity: { type: 'CostEntry', id: 'entry-2' } }),
    )
  })
})

describe('validateBillingPeriod', () => {
  it('berechnet einen validen Stand frisch und deterministisch', () => {
    const data = validData()
    data.billingData.calculationResults.push({
      id: 'stale',
      calculationRunId: 'stale-run',
      snapshotFormatVersion: 1,
      totals: {
        recordedCostsCents: 1,
        tenantTotalCents: 0,
        landlordTotalCents: 0,
        unallocatedCents: 0,
        prepaymentsCents: 0,
        controlDifferenceCents: 999,
      },
      warnings: [],
      resultSnapshot: { totals: { controlDifferenceCents: 999 } },
    })
    const report = validateBillingPeriod(data, 'period-1')
    expect(report.errorCount).toBe(0)
    expect(report.issues).toEqual([])
    expect(report.canBecomeReady).toBe(true)
  })

  it('meldet Schema-Version und ungültige Eingaben ohne Ausnahme', () => {
    expect(codes({ schemaVersion: 99 })).toContain('schema.unsupported_version')
    expect(codes(null)).toContain('schema.unsupported_version')
  })

  it('deckt Stammdaten, Zeitraum, Nutzerflächen und Vorauszahlungen ab', () => {
    const data = validData()
    data.masterData.ownerCompanies = []
    data.masterData.properties[0] = {
      ...data.masterData.properties[0]!,
      address: null,
      bankAccount: null,
    }
    data.billingData.billingPeriods[0] = {
      ...data.billingData.billingPeriods[0]!,
      year: 2024,
      periodStart: '2025-12-31',
      periodEnd: '2025-01-01',
    }
    data.masterData.units[0] = {
      ...data.masterData.units[0]!,
      usableAreaSqm: null,
      heatedAreaSqm: null,
    }
    data.billingData.occupancyPeriods[0] = {
      ...data.billingData.occupancyPeriods[0]!,
      from: '2026-01-01',
      to: '2024-12-31',
    }
    data.billingData.prepayments = []
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'master_data.owner_company_missing',
        'master_data.property_address_missing',
        'master_data.iban_missing',
        'billing_period.invalid_range',
        'billing_period.year_mismatch',
        'occupancy.invalid_range',
        'occupancy.outside_period',
        'occupancy.usable_area_missing',
        'prepayments.missing',
      ]),
    )
  })

  it('deckt Kosten, Belege, Direktzuordnung und Vorjahressteigerung ab', () => {
    const data = validData()
    data.billingData.billingPeriods.push({
      ...data.billingData.billingPeriods[0]!,
      id: 'period-prev',
      year: 2024,
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
    })
    data.billingData.costCategories.push({
      ...data.billingData.costCategories[0]!,
      id: 'category-prev',
      billingPeriodId: 'period-prev',
      totalAmountCents: 1_000,
    })
    data.billingData.costCategories[0] = {
      ...data.billingData.costCategories[0]!,
      allocationKey: 'direct',
      totalAmountCents: 10_000,
    }
    data.billingData.costEntries.push({
      id: 'entry-negative',
      costCategoryId: 'category-1',
      amountCents: -100,
      receiptReference: null,
      externalPayment: null,
    })
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'costs.direct_unassigned',
        'costs.year_over_year_increase',
        'costs.negative_amount',
        'costs.entry_total_mismatch',
        'documents.receipt_missing',
        'documents.booking_link_missing',
      ]),
    )
  })

  it('deckt Heizkreis-, Zähler- und CO2-Plausibilität ab', () => {
    const data = validData()
    data.masterData.heatingSystems.push({
      id: 'system-1',
      propertyId: 'property-1',
    })
    data.masterData.meters.push({
      id: 'meter-1',
      propertyId: 'property-1',
      kind: 'heat',
    })
    data.billingData.costCategories[0] = {
      ...data.billingData.costCategories[0]!,
      kind: 'heating',
    }
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater: true,
      hotWaterSharePercent: 10,
      overrides: { baseSharePercent: 10, consumptionSharePercent: 80 },
      co2: { mode: 'manual', levyCents: 100 },
    })
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'heating.energy_source_missing',
        'heating.split_not_100',
        'heating.consumption_share_out_of_range',
        'heating.nonstandard_split_without_reason',
        'heating.hot_water_share_implausible',
        'meters.number_missing',
        'meters.status_missing',
        'co2.manual_values_incomplete',
      ]),
    )
  })

  it('macht nur aktuelle, unbestätigte Warnungen freigaberelevant', () => {
    const data = validData()
    data.billingData.costEntries[0] = {
      ...data.billingData.costEntries[0]!,
      amountCents: -10_000,
    }
    data.billingData.costCategories[0] = {
      ...data.billingData.costCategories[0]!,
      totalAmountCents: -10_000,
    }
    const first = validateBillingPeriod(data, 'period-1')
    expect(first.unconfirmedWarningKeys.length).toBeGreaterThan(0)
    expect(
      validateBillingPeriod(data, 'period-1', {
        confirmedWarningKeys: first.unconfirmedWarningKeys,
      }).canBecomeReady,
    ).toBe(true)
  })

  it('prüft IBAN, Teiljahr, doppelte und negative Vorauszahlungen', () => {
    const data = validData()
    data.masterData.ownerCompanies[0]!.bankAccount = { iban: 'DE001234' }
    data.billingData.billingPeriods[0] = {
      ...data.billingData.billingPeriods[0]!,
      periodEnd: '2025-06-30',
    }
    data.billingData.prepayments = [
      {
        id: 'prepayment-1',
        occupancyPeriodId: 'occupancy-1',
        mode: 'annual',
        annualAmountCents: -1,
      },
      {
        id: 'prepayment-2',
        occupancyPeriodId: 'occupancy-1',
        mode: 'none_agreed',
      },
    ]
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'master_data.iban_invalid',
        'billing_period.partial_year',
        'prepayments.duplicate',
        'prepayments.negative',
      ]),
    )
  })

  it('prüft fehlende Kostenarten und fehlende/leer laufende Umlagebasen', () => {
    const noCosts = validData()
    noCosts.billingData.costCategories = []
    noCosts.billingData.costEntries = []
    expect(codes(noCosts)).toContain('costs.category_missing')

    const data = validData()
    data.masterData.units[0]!.usableAreaSqm = { value: 0, unit: 'm2' }
    data.billingData.costCategories[0] = {
      ...data.billingData.costCategories[0]!,
      standardKey: null,
      allocationKey: null,
    }
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'costs.standard_category_missing',
        'costs.allocation_key_missing',
      ]),
    )
    data.billingData.costCategories[0]!.allocationKey = 'usable_area'
    expect(codes(data)).toContain('costs.allocation_basis_zero')
  })

  it('prüft ungültige und empfängerlose Kostenbereiche', () => {
    const invalid = validData()
    invalid.billingData.costCategories[0]!.scope = {
      kind: 'building',
      buildingId: 'missing',
    }
    expect(codes(invalid)).toContain('costs.scope_invalid')
    const empty = validData()
    empty.billingData.costCategories[0]!.scope = {
      kind: 'house',
      houseKey: 'OHNE-NUTZER',
    }
    expect(codes(empty)).toContain('costs.scope_without_recipients')
  })

  it('erkennt einen Haus-Empfänger über die Mandatsreferenz wie die Rechenengine', () => {
    const data = validData()
    data.masterData.tenancies[0]!.mandateReference = 'HAUS-A-001'
    data.billingData.costCategories[0]!.scope = {
      kind: 'house',
      houseKey: 'haus-a',
    }

    expect(codes(data)).not.toContain('costs.scope_without_recipients')
  })

  it('prüft eine Flächen-Umlagebasis nur im Empfängerkreis des Kostenbereichs', () => {
    const data = validData()
    data.masterData.buildings.push({
      id: 'building-2',
      propertyId: 'property-1',
      name: 'Haus B',
      mandateRefPrefixes: ['B'],
    })
    data.masterData.units.push({
      id: 'unit-2',
      propertyId: 'property-1',
      buildingId: 'building-2',
      usableAreaSqm: { value: 0, unit: 'm2' },
      heatedAreaSqm: { value: 0, unit: 'm2' },
    })
    data.billingData.occupancyPeriods.push({
      id: 'occupancy-2',
      billingPeriodId: 'period-1',
      unitId: 'unit-2',
      kind: 'vacancy',
    })
    data.billingData.costCategories[0]!.scope = {
      kind: 'building',
      buildingId: 'building-2',
    }

    expect(codes(data)).toContain('costs.allocation_basis_zero')
  })

  it('prüft ungültige Buchungslinks und unbegründete externe Zahlungen', () => {
    const data = validData()
    data.billingData.costEntries[0] = {
      ...data.billingData.costEntries[0]!,
      bookingLink: { bankBookingId: 'missing' },
      externalPayment: { confirmed: true, reason: ' ' },
    }
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'documents.booking_link_invalid',
        'documents.external_payment_reason_missing',
      ]),
    )
  })

  it('prüft fehlenden Heizkreis und unvollständige Energiequellen', () => {
    const missingCircuit = validData()
    missingCircuit.billingData.costCategories[0]!.kind = 'heating'
    expect(codes(missingCircuit)).toContain('heating.circuit_missing')

    const data = validData()
    data.masterData.heatingSystems.push({
      id: 'system-1',
      propertyId: 'property-1',
    })
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater: false,
    })
    data.billingData.energySources.push({
      id: 'source-1',
      heatingCircuitId: 'circuit-1',
      key: 'fiktiv',
    })
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'heating.delivery_missing',
        'co2.calorific_value_missing',
        'co2.factor_missing',
      ]),
    )
  })

  it('prüft Zählerbestätigung, Jahresrechnung und Schätzstatus', () => {
    const data = validData()
    data.masterData.meters.push({
      id: 'meter-1',
      propertyId: 'property-1',
      kind: 'general',
      meterNumber: 'TEST-1',
      meterNumberStatus: 'open',
    })
    data.billingData.meterBillingStatuses.push({
      id: 'status-1',
      meterId: 'meter-1',
      billingPeriodId: 'period-1',
      year: 2025,
      bookingPresent: false,
      annualInvoicePresent: false,
      estimateAmountCents: 100,
    })
    expect(codes(data)).toEqual(
      expect.arrayContaining([
        'meters.number_unconfirmed',
        'meters.booking_missing',
        'meters.annual_invoice_missing',
        'meters.estimate_only',
      ]),
    )
  })

  it('toleriert genau einen Cent Belegabweichung und warnt erst darüber', () => {
    const tolerated = validData()
    tolerated.billingData.costCategories[0]!.totalAmountCents = 10_001
    expect(codes(tolerated)).not.toContain('costs.entry_total_mismatch')

    const mismatch = validData()
    mismatch.billingData.costCategories[0]!.totalAmountCents = 10_002
    const issue = validateBillingPeriod(mismatch, 'period-1').issues.find(
      ({ code }) => code === 'costs.entry_total_mismatch',
    )
    expect(issue?.severity).toBe('warning')
  })

  it('prüft auch Brennstofflieferungen auf Betrag, Beleg und Zahlungsnachweis', () => {
    const data = validData()
    data.masterData.heatingSystems.push({
      id: 'system-1',
      propertyId: 'property-1',
    })
    data.billingData.heatingCircuits.push({
      id: 'circuit-1',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-1',
      hasCentralHotWater: false,
    })
    data.billingData.energySources.push({
      id: 'source-1',
      heatingCircuitId: 'circuit-1',
      key: 'haupt',
      calorificValueKwhPerUnit: 10,
      co2FactorKgPerKwh: 0.2,
    })
    data.billingData.fuelDeliveries.push({
      id: 'delivery-1',
      energySourceId: 'source-1',
      billingPeriodId: 'period-1',
      amountCents: -100,
    })

    const issues = validateBillingPeriod(data, 'period-1').issues.filter(
      ({ entity }) => entity?.id === 'delivery-1',
    )
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'costs.negative_amount',
        'documents.receipt_missing',
        'documents.booking_link_missing',
      ]),
    )
  })

  it('stuft fehlende externe Zahlungsbegründungen als bestätigbare Warnung ein', () => {
    const data = validData()
    data.billingData.costEntries[0]!.externalPayment = {
      confirmed: true,
      reason: ' ',
    }
    const found = validateBillingPeriod(data, 'period-1').issues.find(
      ({ code }) => code === 'documents.external_payment_reason_missing',
    )
    expect(found?.severity).toBe('warning')
  })

  it('ignoriert außerhalb des Zeitraums ungültige Zähler und nutzt MaLo als Kennung', () => {
    const outside = validData()
    outside.masterData.meters.push({
      id: 'meter-old',
      propertyId: 'property-1',
      kind: 'general',
      validTo: '2024-12-31',
    })
    expect(
      validateBillingPeriod(outside, 'period-1').issues.some(
        ({ entity }) => entity?.id === 'meter-old',
      ),
    ).toBe(false)

    const malo = validData()
    malo.masterData.meters.push({
      id: 'meter-malo',
      propertyId: 'property-1',
      kind: 'general',
      maloId: 'DE-FIKTIV-0001',
    })
    const numberIssue = validateBillingPeriod(malo, 'period-1').issues.find(
      ({ code, entity }) =>
        code === 'meters.number_missing' && entity?.id === 'meter-malo',
    )
    expect(numberIssue?.severity).toBe('info')
  })
})
