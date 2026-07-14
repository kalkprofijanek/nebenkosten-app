import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  findForbiddenLockfileSources,
  findSensitiveContent,
  isScannablePath,
  scanRepository,
} from '../../scripts/scan-repository-content.mjs'

test('detects concrete personal and secret-like values', () => {
  const content = [
    `Kontakt: ${'person'}${'@'}${'mail.invalid'}`,
    `IBAN: ${'DE'}${'12345678901234567890'}`,
    `${'token'}=${'github_pat_'}${'1234567890abcdefghij'}`,
    `Adresse: ${'Beispielweg'} ${'17'}`,
  ].join('\n')

  assert.deepEqual(
    findSensitiveContent('notes.txt', content).map(({ kind }) => kind),
    ['email address', 'German IBAN', 'access token', 'street address'],
  )
})

test('accepts documentation keywords and non-secret placeholders', () => {
  const content = [
    'Secrets are never committed.',
    'token=<placeholder>',
    'password=example-only',
    'The fields iban and strasse are schema names.',
  ].join('\n')

  assert.deepEqual(findSensitiveContent('docs/example.md', content), [])
})

test('excludes independently guarded and generated files', () => {
  assert.equal(isScannablePath('legacy/index.html'), false)
  assert.equal(isScannablePath('pnpm-lock.yaml'), false)
  assert.equal(isScannablePath('assets/example.png'), false)
  assert.equal(isScannablePath('apps/web/src/App.tsx'), true)
})

test('allows only registry integrity and workspace links in the lockfile', () => {
  const safeLockfile = [
    "lockfileVersion: '9.0'",
    'resolution: {integrity: sha512-fixture}',
    'version: link:packages/core',
  ].join('\n')
  const unsafeLockfile = [
    'resolution: https://packages.invalid/archive.tgz',
    'resolution: git://example.invalid/package.git',
    'resolution: ssh://example.invalid/package.git',
    'version: file:../outside-workspace',
    'resolution: {directory: ../outside, type: directory}',
    'version: link:../outside-workspace',
  ].join('\n')

  assert.deepEqual(findForbiddenLockfileSources(safeLockfile), [])
  assert.deepEqual(
    findForbiddenLockfileSources(unsafeLockfile),
    [1, 2, 3, 4, 5, 6],
  )
})

test('fails closed when a binary file is part of the repository candidates', () => {
  const findings = scanRepository('.', {
    candidatePaths: ['evidence.pdf'],
    readContent: () => Buffer.from('%PDF-fixture'),
  })

  assert.deepEqual(findings, [
    { kind: 'tracked binary file', line: 1, path: 'evidence.pdf' },
  ])

  const disguisedBinaryFindings = scanRepository('.', {
    candidatePaths: ['evidence.data'],
    readContent: () => Buffer.from([0x50, 0x4b, 0x00, 0x03]),
  })
  assert.deepEqual(disguisedBinaryFindings, [
    { kind: 'tracked binary file', line: 1, path: 'evidence.data' },
  ])
})
