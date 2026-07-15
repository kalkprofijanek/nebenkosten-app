import { describe, expect, it } from 'vitest'

import {
  CURRENT_SCHEMA_VERSION,
  appDataFileSchema,
  createEmptyAppDataFile,
} from '../src'
import { createFictionalAppDataFile } from './fixtures'

describe('appDataFileSchema (aktuelles Format, Version 4)', () => {
  it('akzeptiert eine leere, neu angelegte Datei', () => {
    const file = createEmptyAppDataFile()
    const parsed = appDataFileSchema.safeParse(file)
    expect(parsed.success).toBe(true)
  })

  it('Roundtrip: parse → serialize → parse ist verlustfrei', () => {
    const file = createFictionalAppDataFile()
    const first = appDataFileSchema.parse(file)
    const serialized = JSON.stringify(first)
    const second = appDataFileSchema.parse(JSON.parse(serialized))
    expect(second).toEqual(first)
    // Doppelter Roundtrip bleibt stabil (keine schleichende Normalisierung):
    const third = appDataFileSchema.parse(JSON.parse(JSON.stringify(second)))
    expect(third).toEqual(first)
  })

  it('lehnt falsche oder fehlende schemaVersion ab', () => {
    const file = createFictionalAppDataFile() as Record<string, unknown>
    expect(
      appDataFileSchema.safeParse({ ...file, schemaVersion: 3 }).success,
    ).toBe(false)
    expect(
      appDataFileSchema.safeParse({ ...file, schemaVersion: 5 }).success,
    ).toBe(false)
    const ohneVersion: Record<string, unknown> = { ...file }
    delete ohneVersion.schemaVersion
    expect(appDataFileSchema.safeParse(ohneVersion).success).toBe(false)
    expect(CURRENT_SCHEMA_VERSION).toBe(4)
  })

  it('lehnt unbekannte Felder ab statt sie still zu verlieren (strict)', () => {
    const file = createFictionalAppDataFile() as Record<string, unknown>
    expect(
      appDataFileSchema.safeParse({ ...file, tippfehlerFeld: 1 }).success,
    ).toBe(false)

    const mitUnbekanntemEntityFeld = createFictionalAppDataFile()
    ;(
      mitUnbekanntemEntityFeld.masterData.ownerCompanies[0] as Record<
        string,
        unknown
      >
    ).unbekannt = 'x'
    expect(appDataFileSchema.safeParse(mitUnbekanntemEntityFeld).success).toBe(
      false,
    )
  })

  it('lehnt Fließkomma-Geldbeträge in Entitäten ab (Cent-Invariante)', () => {
    const file = createFictionalAppDataFile()
    file.billingData.costEntries[0]!.amountCents = 1200.5
    expect(appDataFileSchema.safeParse(file).success).toBe(false)
  })

  it('lehnt Nicht-ISO-Datumsformate ab', () => {
    const file = createFictionalAppDataFile()
    file.billingData.billingPeriods[0]!.periodStart = '01.01.2024'
    expect(appDataFileSchema.safeParse(file).success).toBe(false)
  })

  it('lehnt Zeitstempel ohne Zeitzone ab', () => {
    const file = createFictionalAppDataFile()
    file.meta.savedAt = '2025-01-15T09:30:00'
    expect(appDataFileSchema.safeParse(file).success).toBe(false)
  })

  it('hält null, „nicht erfasst“ (fehlend) und 0 unterscheidbar', () => {
    const file = createFictionalAppDataFile()
    const unit = file.masterData.units[0]!
    // 0 ist ein echter Wert:
    unit.roomCount = 0
    // null ist „bewusst nicht vorhanden“:
    unit.heatedAreaSqm = null
    // fehlend ist „nicht erfasst“:
    delete unit.usableAreaSqm
    const parsed = appDataFileSchema.parse(file)
    const parsedUnit = parsed.masterData.units[0]!
    expect(parsedUnit.roomCount).toBe(0)
    expect(parsedUnit.heatedAreaSqm).toBeNull()
    expect('usableAreaSqm' in parsedUnit).toBe(false)
  })

  it('erzwingt Mengen mit expliziter Einheit', () => {
    const file = createFictionalAppDataFile()
    // @ts-expect-error bewusst ungültiger Wert (nackte Zahl statt Quantity)
    file.masterData.units[0]!.usableAreaSqm = 80
    expect(appDataFileSchema.safeParse(file).success).toBe(false)
  })

  it('Prepayment: Modus und Betragsfeld müssen zusammenpassen', () => {
    const file = createFictionalAppDataFile()
    const kaputt = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      occupancyPeriodId: '99999999-9999-4999-8999-999999999999',
      mode: 'monthly',
      annualAmountCents: 100000,
    }
    // @ts-expect-error bewusst falsch kombiniert
    file.billingData.prepayments.push(kaputt)
    expect(appDataFileSchema.safeParse(file).success).toBe(false)
  })
})
