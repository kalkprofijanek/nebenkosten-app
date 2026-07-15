import { describe, expect, it } from 'vitest'

import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_V3_SCHEMA_VERSION,
  entityIdSchema,
  isoDateSchema,
  isoTimestampSchema,
  moneyCentsSchema,
  nonNegativeMoneyCentsSchema,
  percentSchema,
  quantitySchema,
  uuidSchema,
} from '../src'

describe('Schema-Versionskonstanten', () => {
  it('sind explizit und aufsteigend', () => {
    expect(LEGACY_V3_SCHEMA_VERSION).toBe(3)
    expect(CURRENT_SCHEMA_VERSION).toBe(4)
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(LEGACY_V3_SCHEMA_VERSION)
  })
})

describe('entityIdSchema', () => {
  it('akzeptiert UUIDs und Legacy-IDs', () => {
    expect(
      entityIdSchema.safeParse('7f0d9a4e-1b2c-4d3e-8f90-1a2b3c4d5e6f').success,
    ).toBe(true)
    expect(entityIdSchema.safeParse('f_ab12cd3').success).toBe(true)
    expect(entityIdSchema.safeParse('B4:wp_strom').success).toBe(true)
  })

  it('lehnt leere und unbrauchbare IDs ab', () => {
    expect(entityIdSchema.safeParse('').success).toBe(false)
    expect(entityIdSchema.safeParse('mit leerzeichen').success).toBe(false)
    expect(entityIdSchema.safeParse(42).success).toBe(false)
  })

  it('uuidSchema erzwingt echte UUIDs', () => {
    expect(uuidSchema.safeParse('f_ab12cd3').success).toBe(false)
    expect(
      uuidSchema.safeParse('7f0d9a4e-1b2c-4d3e-8f90-1a2b3c4d5e6f').success,
    ).toBe(true)
  })
})

describe('isoDateSchema (YYYY-MM-DD)', () => {
  it('akzeptiert gültige Kalenderdaten', () => {
    expect(isoDateSchema.safeParse('2024-01-01').success).toBe(true)
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true)
  })

  it('lehnt andere Formate und ungültige Daten ab', () => {
    expect(isoDateSchema.safeParse('01.01.2024').success).toBe(false)
    expect(isoDateSchema.safeParse('2024-13-01').success).toBe(false)
    expect(isoDateSchema.safeParse('2024-1-1').success).toBe(false)
    expect(isoDateSchema.safeParse('2024-01-01T00:00:00Z').success).toBe(false)
    expect(isoDateSchema.safeParse(20240101).success).toBe(false)
  })
})

describe('isoTimestampSchema (ISO-8601 mit Zeitzone)', () => {
  it('akzeptiert Z und Offsets', () => {
    expect(isoTimestampSchema.safeParse('2024-06-30T12:00:00Z').success).toBe(
      true,
    )
    expect(
      isoTimestampSchema.safeParse('2024-06-30T12:00:00+02:00').success,
    ).toBe(true)
  })

  it('lehnt Zeitstempel ohne Zeitzone und reine Daten ab', () => {
    expect(isoTimestampSchema.safeParse('2024-06-30T12:00:00').success).toBe(
      false,
    )
    expect(isoTimestampSchema.safeParse('2024-06-30').success).toBe(false)
  })
})

describe('moneyCentsSchema (ganze Centwerte)', () => {
  it('akzeptiert ganze Cent inklusive 0 und negativer Beträge', () => {
    expect(moneyCentsSchema.safeParse(0).success).toBe(true)
    expect(moneyCentsSchema.safeParse(123456).success).toBe(true)
    expect(moneyCentsSchema.safeParse(-9950).success).toBe(true)
  })

  it('lehnt Fließkommawerte strikt ab (keine Euro-Floats)', () => {
    expect(moneyCentsSchema.safeParse(12.34).success).toBe(false)
    expect(moneyCentsSchema.safeParse(0.1).success).toBe(false)
    expect(moneyCentsSchema.safeParse(-0.5).success).toBe(false)
  })

  it('lehnt Strings, NaN und Infinity ab', () => {
    expect(moneyCentsSchema.safeParse('1234').success).toBe(false)
    expect(moneyCentsSchema.safeParse(Number.NaN).success).toBe(false)
    expect(moneyCentsSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(
      false,
    )
  })

  it('nonNegativeMoneyCentsSchema lehnt negative Beträge ab', () => {
    expect(nonNegativeMoneyCentsSchema.safeParse(-1).success).toBe(false)
    expect(nonNegativeMoneyCentsSchema.safeParse(0).success).toBe(true)
  })
})

describe('percentSchema', () => {
  it('akzeptiert 0–100 als Zahl', () => {
    expect(percentSchema.safeParse(0).success).toBe(true)
    expect(percentSchema.safeParse(70).success).toBe(true)
    expect(percentSchema.safeParse(18.5).success).toBe(true)
  })

  it('lehnt Bereichsverletzungen und formatierte Strings ab', () => {
    expect(percentSchema.safeParse(-1).success).toBe(false)
    expect(percentSchema.safeParse(100.01).success).toBe(false)
    expect(percentSchema.safeParse('70 %').success).toBe(false)
  })
})

describe('quantitySchema (Einheit + Dezimalwert)', () => {
  it('akzeptiert Mengen mit expliziter Einheit', () => {
    expect(quantitySchema.safeParse({ value: 2500.5, unit: 'l' }).success).toBe(
      true,
    )
    expect(quantitySchema.safeParse({ value: 0, unit: 'kWh' }).success).toBe(
      true,
    )
  })

  it('lehnt Mengen ohne Einheit oder mit unbekannter Einheit ab', () => {
    expect(quantitySchema.safeParse({ value: 12 }).success).toBe(false)
    expect(quantitySchema.safeParse({ value: 12, unit: 'Eimer' }).success).toBe(
      false,
    )
    expect(quantitySchema.safeParse(12).success).toBe(false)
  })
})
