import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageNames = Object.freeze([
  'core',
  'schema',
  'validators',
  'persistence',
  'import-export',
  'pdf',
  'ui',
  'test-fixtures',
])

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), 'utf8'))
}

test('workspace contains every planned API-neutral package', () => {
  for (const packageName of packageNames) {
    const packageRoot = `packages/${packageName}`
    assert.equal(
      existsSync(resolve(repositoryRoot, packageRoot, 'src/index.ts')),
      true,
    )
    assert.equal(
      existsSync(resolve(repositoryRoot, packageRoot, 'tsconfig.json')),
      true,
    )

    const manifest = readJson(`${packageRoot}/package.json`)
    assert.equal(manifest.name, `@nebenkosten/${packageName}`)
    assert.equal(manifest.private, true)
    assert.equal(manifest.exports, './src/index.ts')
    assert.equal(
      readFileSync(
        resolve(repositoryRoot, packageRoot, 'src/index.ts'),
        'utf8',
      ).trim(),
      'export {}',
    )
  }
})

test('domain-neutral packages have no browser or React surface', () => {
  for (const packageName of ['core', 'schema', 'validators']) {
    const packageRoot = `packages/${packageName}`
    const manifest = readJson(`${packageRoot}/package.json`)
    const tsconfig = readJson(`${packageRoot}/tsconfig.json`)

    assert.equal(manifest.dependencies, undefined)
    assert.deepEqual(tsconfig.compilerOptions.lib, ['ES2022'])
  }
})

test('workspace and test group directories are declared', () => {
  const workspace = readFileSync(
    resolve(repositoryRoot, 'pnpm-workspace.yaml'),
    'utf8',
  )
  assert.match(workspace, /apps\/\*/u)
  assert.match(workspace, /packages\/\*/u)

  for (const directory of [
    'characterization',
    'integration',
    'migration',
    'e2e',
  ]) {
    assert.equal(existsSync(resolve(repositoryRoot, 'tests', directory)), true)
  }
})
