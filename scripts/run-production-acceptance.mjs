import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import { createServer } from 'vite'

const MAX_LEGACY_BYTES = 10 * 1024 * 1024
const MAX_EXPECTATION_BYTES = 1024 * 1024

let pendingResult = {
  value: { ok: false, code: 'acceptance.run_failed' },
  exitCode: 1,
}

function setResult(value, exitCode = 0) {
  pendingResult = { value, exitCode }
}

async function readBoundedFile(path, maximumBytes) {
  const handle = await open(path, 'r')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > maximumBytes) return undefined
    const buffer = Buffer.allocUnsafe(maximumBytes + 1)
    let byteLength = 0
    while (byteLength < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        byteLength,
        buffer.byteLength - byteLength,
        byteLength,
      )
      if (bytesRead === 0) break
      byteLength += bytesRead
    }
    const finalMetadata = await handle.stat()
    if (byteLength > maximumBytes || finalMetadata.size > maximumBytes)
      return undefined
    return buffer.subarray(0, byteLength)
  } finally {
    await handle.close()
  }
}

async function run(legacyPath, expectationPath, billingYear) {
  const [legacyBytes, expectationBytes] = await Promise.all([
    readBoundedFile(legacyPath, MAX_LEGACY_BYTES),
    readBoundedFile(expectationPath, MAX_EXPECTATION_BYTES),
  ])
  if (legacyBytes === undefined) {
    setResult({ ok: false, code: 'acceptance.legacy_source_too_large' }, 1)
    return
  }
  if (expectationBytes === undefined) {
    setResult({ ok: false, code: 'acceptance.expectation_too_large' }, 1)
    return
  }

  let expectation
  try {
    expectation = JSON.parse(expectationBytes.toString('utf8'))
  } catch {
    setResult({ ok: false, code: 'acceptance.invalid_expectation_json' }, 1)
    return
  }

  let server
  try {
    server = await createServer({
      root: process.cwd(),
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      appType: 'custom',
    })
    const [importExport, core, acceptance] = await Promise.all([
      server.ssrLoadModule('/packages/import-export/src/index.ts'),
      server.ssrLoadModule('/packages/core/src/index.ts'),
      server.ssrLoadModule('/packages/acceptance/src/index.ts'),
    ])
    const migration = await importExport.importLegacyV3Bytes(legacyBytes, {
      sourceFileName: basename(legacyPath),
      appVersion: 'pr12-production-acceptance',
    })
    if (!migration.ok) {
      setResult(
        {
          ok: false,
          code: 'acceptance.migration_failed',
          reason: migration.reason,
          issueCodes: migration.issues.map((issue) => issue.code),
        },
        1,
      )
      return
    }

    const periods = migration.data.billingData.billingPeriods.filter(
      (period) => period.year === billingYear,
    )
    if (periods.length !== 1) {
      setResult({ ok: false, code: 'acceptance.billing_period_not_unique' }, 1)
      return
    }

    const actual = core.calculateBilling(
      core.createCalculationInput(migration.data, periods[0].id),
    )
    const report = acceptance.compareAcceptance(expectation, actual)
    setResult(
      {
        ok: report.passed,
        code: report.passed
          ? 'acceptance.passed'
          : 'acceptance.comparison_failed',
        reference: report.reference,
        comparisons: report.comparisons.map((comparison) => ({
          metric: comparison.metric,
          reference: comparison.reference,
          differenceCents: comparison.differenceCents,
          toleranceCents: comparison.toleranceCents,
          passed: comparison.passed,
        })),
        issues: report.issues,
      },
      report.passed ? 0 : 1,
    )
  } catch {
    setResult({ ok: false, code: 'acceptance.run_failed' }, 1)
  } finally {
    if (server !== undefined) {
      try {
        await server.close()
      } catch {
        setResult({ ok: false, code: 'acceptance.cleanup_failed' }, 1)
      }
    }
  }
}

const [legacyPath, expectationPath, yearText] = process.argv.slice(2)
const billingYear = Number(yearText)

if (
  legacyPath === undefined ||
  expectationPath === undefined ||
  !Number.isInteger(billingYear) ||
  billingYear < 1900 ||
  billingYear > 2200
) {
  setResult({ ok: false, code: 'acceptance.invalid_arguments' }, 2)
} else {
  try {
    await run(legacyPath, expectationPath, billingYear)
  } catch {
    setResult({ ok: false, code: 'acceptance.io_failed' }, 1)
  }
}

process.stdout.write(`${JSON.stringify(pendingResult.value)}\n`)
process.exitCode = pendingResult.exitCode
