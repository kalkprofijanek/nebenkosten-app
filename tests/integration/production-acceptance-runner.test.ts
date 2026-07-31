import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { importLegacyV3Bytes } from '@nebenkosten/import-export'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFictionalV3File } from '../../packages/schema/tests/fixtures'

const execFileAsync = promisify(execFile)
const ROOT = resolve(import.meta.dirname, '../..')
const RUNNER = join(ROOT, 'scripts/run-production-acceptance.mjs')

interface RunnerResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly json: Record<string, unknown>
}

async function runRunner(args: readonly string[]): Promise<RunnerResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [RUNNER, ...args],
      { cwd: ROOT, maxBuffer: 2 * 1024 * 1024 },
    )
    return { exitCode: 0, stdout, stderr, json: JSON.parse(stdout) }
  } catch (caught: unknown) {
    const error = caught as Error & {
      code?: number
      stdout?: string
      stderr?: string
    }
    const stdout = error.stdout ?? ''
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout,
      stderr: error.stderr ?? '',
      json: JSON.parse(stdout),
    }
  }
}

describe('Produktions-Abnahmerunner', () => {
  let directory: string
  let legacyPath: string
  let expectationPath: string
  let expectation: Record<string, unknown>
  let billingYear: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nk-acceptance-'))
    legacyPath = join(directory, 'fiktiv-v3.json')
    expectationPath = join(directory, 'fiktiv-erwartung.json')
    const legacyBytes = Buffer.from(JSON.stringify(createFictionalV3File()))
    await writeFile(legacyPath, legacyBytes)
    const migration = await importLegacyV3Bytes(legacyBytes, {
      sourceFileName: 'fiktiv-v3.json',
      appVersion: 'runner-test',
    })
    if (!migration.ok) throw new Error('Fiktive Migration erwartet')
    const period = migration.data.billingData.billingPeriods[0]!
    billingYear = String(period.year)
    const actual = calculateBilling(
      createCalculationInput(migration.data, period.id),
    )
    expectation = {
      reference: 'runner-fiktiv',
      totals: {
        recordedCostsCents: actual.totals.recordedCostsCents,
        heatingTotalCents: actual.heating.totalCents,
        co2TenantCents: actual.co2.tenantCents,
        co2LandlordCents: actual.co2.landlordCents,
        prepaymentsCents: actual.totals.prepaymentsCents,
        vacancyLandlordCents: actual.vacancyLandlordCents,
        controlDifferenceCents: actual.totals.controlDifferenceCents,
      },
      occupancies: actual.tenants.map((tenant, index) => ({
        reference: `nutzung-${index + 1}`,
        calculationResultId: tenant.id,
        isVacancy: tenant.isVacancy,
        shareCents: tenant.shareCents,
        prepaymentCents: tenant.prepaymentCents,
        balanceCents: tenant.balanceCents,
      })),
    }
    await writeFile(expectationPath, JSON.stringify(expectation))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('führt den lokalen v3→v4→Engine-Vergleich ohne Rohbeträge aus', async () => {
    const result = await runRunner([legacyPath, expectationPath, billingYear])

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: '',
      json: { ok: true, code: 'acceptance.passed' },
    })
    expect(result.stdout).not.toMatch(/expectedCents|actualCents/u)
  })

  it('meldet Vergleichsabweichungen nur als Differenzen', async () => {
    const totals = expectation.totals as Record<string, number>
    totals.recordedCostsCents = (totals.recordedCostsCents ?? 0) + 1
    await writeFile(expectationPath, JSON.stringify(expectation))

    const result = await runRunner([legacyPath, expectationPath, billingYear])

    expect(result).toMatchObject({
      exitCode: 1,
      json: { ok: false, code: 'acceptance.comparison_failed' },
    })
    expect(result.stdout).toContain('differenceCents')
    expect(result.stdout).not.toMatch(/expectedCents|actualCents/u)
  })

  it('weist ungültige Erwartungsdateien redigiert ab', async () => {
    await writeFile(expectationPath, '{')

    const result = await runRunner([legacyPath, expectationPath, billingYear])

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: '',
      json: { ok: false, code: 'acceptance.invalid_expectation_json' },
    })
  })

  it('prüft beide Dateigrenzen vor der Verarbeitung', async () => {
    await writeFile(expectationPath, Buffer.alloc(1024 * 1024 + 1))
    expect(
      await runRunner([legacyPath, expectationPath, billingYear]),
    ).toMatchObject({
      exitCode: 1,
      json: { code: 'acceptance.expectation_too_large' },
    })

    await writeFile(expectationPath, JSON.stringify(expectation))
    await writeFile(legacyPath, Buffer.alloc(10 * 1024 * 1024 + 1))
    expect(
      await runRunner([legacyPath, expectationPath, billingYear]),
    ).toMatchObject({
      exitCode: 1,
      json: { code: 'acceptance.legacy_source_too_large' },
    })
  })

  it('meldet fehlende Abrechnungsperioden stabil', async () => {
    const result = await runRunner([legacyPath, expectationPath, '2099'])

    expect(result).toMatchObject({
      exitCode: 1,
      json: { code: 'acceptance.billing_period_not_unique' },
    })
  })

  it('meldet Migrationsfehler nur mit stabilen Codes', async () => {
    await writeFile(legacyPath, JSON.stringify({ version: 99 }))

    const result = await runRunner([legacyPath, expectationPath, billingYear])

    expect(result).toMatchObject({
      exitCode: 1,
      json: { code: 'acceptance.migration_failed' },
    })
  })

  it('unterdrückt private Pfade bei Dateifehlern', async () => {
    const missingPath = join(directory, 'vertraulicher-mietername.json')

    const result = await runRunner([missingPath, expectationPath, billingYear])

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: '',
      json: { code: 'acceptance.io_failed' },
    })
    expect(result.stdout).not.toContain('vertraulicher-mietername')
  })
})
