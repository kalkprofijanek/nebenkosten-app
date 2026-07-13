import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  calculateSha256,
  findForbiddenTrackedFiles,
  findMissingIgnoreRules,
  verifyRepository,
} from '../../scripts/verify-repository-guardrails.mjs'

const completeGitignore = [
  'private-data/',
  '*.bak',
  '*.backup',
  '*.tmp',
  'nk-daten.json',
  '.env',
  '.env.*',
  'node_modules/',
  'dist/',
].join('\n')

function createRepositoryFixture() {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'nk-guardrails-'))
  mkdirSync(join(repositoryRoot, '.github', 'workflows'), { recursive: true })
  mkdirSync(join(repositoryRoot, 'legacy'), { recursive: true })

  for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'SECURITY.md']) {
    writeFileSync(join(repositoryRoot, file), `${file}\n`)
  }
  writeFileSync(
    join(repositoryRoot, '.github', 'workflows', 'guardrails.yml'),
    'name: guardrails\n',
  )
  const legacyContent = Buffer.from('unchanged legacy fixture\n')
  writeFileSync(join(repositoryRoot, 'legacy', 'index.html'), legacyContent)
  writeFileSync(
    join(repositoryRoot, 'legacy', 'SHA256SUMS'),
    `${calculateSha256(legacyContent)}  index.html\n`,
  )
  writeFileSync(join(repositoryRoot, '.gitignore'), completeGitignore)

  execFileSync('git', ['init'], { cwd: repositoryRoot })
  execFileSync('git', ['add', '.'], { cwd: repositoryRoot })
  return Object.freeze({
    legacyReferenceHash: calculateSha256(legacyContent),
    repositoryRoot,
  })
}

test('findMissingIgnoreRules reports every absent privacy rule', () => {
  const missingRules = findMissingIgnoreRules('private-data/\n.env\n')

  assert.deepEqual(missingRules, [
    '*.bak',
    '*.backup',
    '*.tmp',
    'nk-daten.json',
    '.env.*',
    'node_modules/',
    'dist/',
  ])
})

test('findMissingIgnoreRules accepts the complete required rule set', () => {
  assert.deepEqual(findMissingIgnoreRules(completeGitignore), [])
})

test('findForbiddenTrackedFiles rejects private and environment files', () => {
  const trackedFiles = [
    'README.md',
    'private-data/import/abrechnung.json',
    'fixtures/nk-daten.json',
    '.env.production',
    'backups/abrechnung.backup',
    'scratch.tmp',
    'node_modules/example/index.js',
    'apps/web/dist/index.js',
  ]

  assert.deepEqual(findForbiddenTrackedFiles(trackedFiles), [
    'private-data/import/abrechnung.json',
    'fixtures/nk-daten.json',
    '.env.production',
    'backups/abrechnung.backup',
    'scratch.tmp',
    'node_modules/example/index.js',
    'apps/web/dist/index.js',
  ])
})

test('findForbiddenTrackedFiles permits the anonymized application files', () => {
  assert.deepEqual(
    findForbiddenTrackedFiles([
      '.env.example',
      'legacy/index.html',
      'tests/fixtures/anonymized-v3.json',
    ]),
    [],
  )
})

test('calculateSha256 returns the expected lowercase digest', () => {
  assert.equal(
    calculateSha256(Buffer.from('legacy-reference')),
    '9d6c58dd3308cff56aaad89624b52363c4d88a1c733c67fb5f502f37f4605884',
  )
})

test('verifyRepository accepts a complete and unchanged repository', (context) => {
  const { legacyReferenceHash, repositoryRoot } = createRepositoryFixture()
  context.after(() => rmSync(repositoryRoot, { recursive: true, force: true }))

  const result = verifyRepository(repositoryRoot, { legacyReferenceHash })

  assert.deepEqual(result.failures, [])
  assert.equal(result.actualHash.length, 64)
})

test('verifyRepository reports checksum, ignore, and tracked-file violations', (context) => {
  const { legacyReferenceHash, repositoryRoot } = createRepositoryFixture()
  context.after(() => rmSync(repositoryRoot, { recursive: true, force: true }))
  writeFileSync(join(repositoryRoot, '.gitignore'), 'private-data/\n')
  writeFileSync(
    join(repositoryRoot, 'legacy', 'SHA256SUMS'),
    `${'0'.repeat(64)}  index.html\n`,
  )
  writeFileSync(join(repositoryRoot, '.env.production'), 'SECRET=fixture-only\n')
  execFileSync('git', ['add', '--force', '.env.production'], {
    cwd: repositoryRoot,
  })

  const result = verifyRepository(repositoryRoot, { legacyReferenceHash })

  assert.ok(result.failures.some((failure) => /Missing \.gitignore rules/u.test(failure)))
  assert.ok(result.failures.some((failure) => /checksum baseline mismatch/u.test(failure)))
  assert.ok(result.failures.some((failure) => /Forbidden tracked files/u.test(failure)))
})

test('verifyRepository rejects a jointly changed legacy file and checksum', (context) => {
  const { legacyReferenceHash, repositoryRoot } = createRepositoryFixture()
  context.after(() => rmSync(repositoryRoot, { recursive: true, force: true }))
  const changedLegacy = Buffer.from('jointly changed legacy and checksum\n')
  writeFileSync(join(repositoryRoot, 'legacy', 'index.html'), changedLegacy)
  writeFileSync(
    join(repositoryRoot, 'legacy', 'SHA256SUMS'),
    `${calculateSha256(changedLegacy)}  index.html\n`,
  )

  const result = verifyRepository(repositoryRoot, { legacyReferenceHash })

  assert.ok(result.failures.some((failure) => /checksum baseline mismatch/u.test(failure)))
  assert.ok(result.failures.some((failure) => /Legacy file mismatch/u.test(failure)))
})

test('verifyRepository rejects ignore negations that expose protected paths', (context) => {
  const { legacyReferenceHash, repositoryRoot } = createRepositoryFixture()
  context.after(() => rmSync(repositoryRoot, { recursive: true, force: true }))
  writeFileSync(
    join(repositoryRoot, '.gitignore'),
    `${completeGitignore}\n!private-data/\n!private-data/probe.json\n`,
  )

  const result = verifyRepository(repositoryRoot, { legacyReferenceHash })

  assert.ok(result.failures.some((failure) => /Ineffective \.gitignore rules/u.test(failure)))
})

test('verifyRepository reports missing inputs without throwing a stack trace', (context) => {
  const { legacyReferenceHash, repositoryRoot } = createRepositoryFixture()
  context.after(() => rmSync(repositoryRoot, { recursive: true, force: true }))
  rmSync(join(repositoryRoot, '.gitignore'))
  rmSync(join(repositoryRoot, 'legacy', 'SHA256SUMS'))
  rmSync(join(repositoryRoot, 'legacy', 'index.html'))

  const result = verifyRepository(repositoryRoot, { legacyReferenceHash })

  assert.ok(result.failures.includes('Required file is missing: .gitignore'))
  assert.ok(result.failures.includes('Required file is missing: legacy/SHA256SUMS'))
  assert.ok(result.failures.includes('Required file is missing: legacy/index.html'))
})
