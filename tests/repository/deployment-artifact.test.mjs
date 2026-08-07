import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  inspectDeploymentEntries,
  verifyDeploymentArtifact,
} from '../../scripts/verify-deployment-artifact.mjs'

const textEntry = (relativePath, content) =>
  Object.freeze({
    content: Buffer.from(content),
    kind: 'file',
    relativePath,
    size: Buffer.byteLength(content),
  })

test('accepts a minimal static deployment without application data', () => {
  const result = inspectDeploymentEntries([
    textEntry('index.html', '<main id="root"></main>'),
    textEntry('assets/app.js', 'globalThis.__APP__ = true'),
    textEntry('assets/app.css', 'body { color: #123456; }'),
  ])

  assert.deepEqual(result.failures, [])
  assert.equal(result.fileCount, 3)
  assert.equal(result.totalBytes > 0, true)
})

test('requires index.html and rejects non-static or hidden files', () => {
  const result = inspectDeploymentEntries([
    textEntry('assets/app.js', 'export {}'),
    textEntry('backup.json', '{}'),
    textEntry('.env', 'MODE=fixture-only'),
  ])

  assert.ok(
    result.failures.includes('Required deployment file is missing: index.html'),
  )
  assert.ok(result.failures.includes('Forbidden deployment file: backup.json'))
  assert.ok(result.failures.includes('Forbidden deployment path: .env'))
})

test('rejects links, private paths and traversal-like paths', () => {
  const result = inspectDeploymentEntries([
    textEntry('index.html', '<main></main>'),
    Object.freeze({
      content: Buffer.alloc(0),
      kind: 'symbolic-link',
      relativePath: 'assets/link.js',
      size: 0,
    }),
    textEntry('private-data/export.js', 'export {}'),
    textEntry('../outside.js', 'export {}'),
  ])

  assert.ok(
    result.failures.includes('Deployment links are forbidden: assets/link.js'),
  )
  assert.ok(
    result.failures.includes(
      'Forbidden deployment path: private-data/export.js',
    ),
  )
  assert.ok(
    result.failures.includes('Forbidden deployment path: ../outside.js'),
  )
})

test('redacts sensitive values while reporting their artifact path', () => {
  const fictionalEmail = ['person', 'example.org'].join('@')
  const result = inspectDeploymentEntries([
    textEntry('index.html', '<main></main>'),
    textEntry(
      'assets/app.js',
      `const contact = "${fictionalEmail}"; const local = "C:\\\\Users\\\\name\\\\data.json"`,
    ),
  ])

  assert.ok(
    result.failures.some((failure) =>
      failure.startsWith('Sensitive deployment content: assets/app.js:'),
    ),
  )
  assert.equal(
    result.failures.some((failure) => failure.includes(fictionalEmail)),
    false,
  )
  assert.equal(
    result.failures.some((failure) => failure.includes('C:\\Users')),
    false,
  )
})

test('enforces file-count, per-file and total-size budgets', () => {
  const entries = [
    textEntry('index.html', '<main></main>'),
    textEntry('assets/a.js', '12345'),
    textEntry('assets/b.js', '67890'),
  ]
  const result = inspectDeploymentEntries(entries, {
    maximumFileBytes: 4,
    maximumFileCount: 2,
    maximumTotalBytes: 8,
  })

  assert.ok(
    result.failures.includes('Deployment contains too many files: 3 > 2'),
  )
  assert.ok(
    result.failures.includes('Deployment file exceeds size limit: assets/a.js'),
  )
  assert.ok(
    result.failures.includes('Deployment file exceeds size limit: assets/b.js'),
  )
  assert.ok(result.failures.includes('Deployment exceeds total size limit'))
})

test('verifies a real deployment directory without exposing its absolute path', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'nk-deployment-'))
  context.after(() => rmSync(root, { force: true, recursive: true }))
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<main id="root"></main>')
  writeFileSync(join(root, 'assets', 'app.js'), 'globalThis.__APP__ = true')

  const result = verifyDeploymentArtifact(root)

  assert.deepEqual(result.failures, [])
  assert.equal(JSON.stringify(result).includes(root), false)
})

test('stops directory traversal when the total entry budget is exceeded', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'nk-deployment-entries-'))
  context.after(() => rmSync(root, { force: true, recursive: true }))
  writeFileSync(join(root, 'index.html'), '<main></main>')
  for (const name of ['a', 'b', 'c']) {
    mkdirSync(join(root, name))
  }

  const result = verifyDeploymentArtifact(root, { maximumEntryCount: 3 })

  assert.ok(
    result.failures.includes(
      'Deployment contains too many directory entries: 4 > 3',
    ),
  )
})
