import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import {
  findForbiddenLockfileSources,
  findSensitiveContent,
  isScannablePath,
  parseReleasedMediaManifest,
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

test('allows the GitHub OIDC permission but still rejects a generic token assignment', () => {
  const oidcPermission = ['id-token', 'write'].join(': ')
  const genericTokenAssignment = ['token', 'write'].join(': ')
  assert.deepEqual(
    findSensitiveContent('.github/workflows/pages.yml', oidcPermission),
    [],
  )
  assert.deepEqual(findSensitiveContent('notes.yml', oidcPermission), [
    { kind: 'credential assignment', line: 1, path: 'notes.yml' },
  ])
  assert.deepEqual(findSensitiveContent('config.yml', genericTokenAssignment), [
    { kind: 'credential assignment', line: 1, path: 'config.yml' },
  ])
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
    'importers:',
    '  .:',
    '        version: link:packages/core',
    '  packages/core: {}',
    '  packages/import-export:',
    '        version: link:../schema',
    '  packages/schema:',
  ].join('\n')
  const unsafeLockfile = [
    'resolution: https://packages.invalid/archive.tgz',
    'resolution: git://example.invalid/package.git',
    'resolution: ssh://example.invalid/package.git',
    'version: file:../outside-workspace',
    'resolution: {directory: ../outside, type: directory}',
    'importers:',
    '  packages/import-export:',
    '        version: link:../outside',
    '  apps/web:',
    '        version: link:../../outside',
    '        quotedHttps: "ignored-key"',
    '        version: "https://packages.invalid/quoted.tgz"',
    "        version: 'link:../../quoted-outside'",
  ].join('\n')

  assert.deepEqual(findForbiddenLockfileSources(safeLockfile), [])
  assert.deepEqual(
    findForbiddenLockfileSources(unsafeLockfile),
    [1, 2, 3, 4, 5, 8, 10, 12, 13],
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

test('allows binary media only in docs/medien with a matching manifest hash', () => {
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
  const hash = createHash('sha256').update(image).digest('hex')
  const files = new Map([
    ['docs/medien/SHA256SUMS', Buffer.from(`${hash}  01-bild.png\n`)],
    ['docs/medien/01-bild.png', image],
    ['docs/medien/02-neu.png', image],
    ['docs/medien/03-geaendert.png', Buffer.from([0x00, 0x02])],
    ['docs/anderswo/01-bild.png', image],
  ])
  files.set(
    'docs/medien/SHA256SUMS',
    Buffer.from(
      [
        `${hash}  01-bild.png`,
        `${hash}  03-geaendert.png`,
        `${hash}  ../anderswo/01-bild.png`,
        '',
      ].join('\n'),
    ),
  )
  const findings = scanRepository('.', {
    candidatePaths: [...files.keys()],
    readContent: (path) => files.get(path),
  })

  assert.deepEqual(
    findings.map(({ path }) => path),
    [
      'docs/medien/02-neu.png',
      'docs/medien/03-geaendert.png',
      'docs/anderswo/01-bild.png',
    ],
  )
  assert.ok(findings.every(({ kind }) => kind === 'tracked binary file'))
})

test('ignores malformed manifest lines and works without a manifest', () => {
  const manifest = parseReleasedMediaManifest(
    ['kein hash  datei.png', `${'a'.repeat(64)} einfach.png`, ''].join('\n'),
  )
  assert.equal(manifest.size, 0)

  const findings = scanRepository('.', {
    candidatePaths: ['docs/medien/01-bild.png'],
    readContent: () => Buffer.from([0x00]),
  })
  assert.deepEqual(findings, [
    { kind: 'tracked binary file', line: 1, path: 'docs/medien/01-bild.png' },
  ])
})

test('accepts only fictitious IBANs with the unassigned bank code 00000000', () => {
  const fictitious = `IBAN: ${'DE50'}${'00000000'}${'0123456789'}`
  const realistic = `IBAN: ${'DE50'}${'10000000'}${'0123456789'}`
  assert.deepEqual(findSensitiveContent('docs/beispiel.json', fictitious), [])
  assert.deepEqual(
    findSensitiveContent('docs/beispiel.json', realistic).map(
      ({ kind }) => kind,
    ),
    ['German IBAN'],
  )
})
