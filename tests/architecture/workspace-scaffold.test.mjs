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

/**
 * Packages, die bereits echte Implementierung tragen (kein
 * `export {}`-Platzhalter mehr). Wächst mit jedem Fach-PR;
 * Änderungen an dieser Liste sind Vertragsänderungen und gehören
 * sichtbar in den jeweiligen PR (PR 03: schema).
 */
const implementedPackages = Object.freeze(new Set(['schema']))

/**
 * Erlaubte Laufzeit-Dependencies der domänenneutralen Packages.
 * Zod ist die vom Masterplan (4.1) vorgeschriebene
 * Laufzeitvalidierung; Browser-/React-/Build-Bibliotheken bleiben
 * verboten.
 */
const allowedNeutralDependencies = Object.freeze(new Set(['zod']))
const forbiddenDependencyPattern =
  /react|vite|vitest|playwright|jsdom|dom|browser/iu

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

    const indexSource = readFileSync(
      resolve(repositoryRoot, packageRoot, 'src/index.ts'),
      'utf8',
    ).trim()
    if (implementedPackages.has(packageName)) {
      assert.notEqual(indexSource, 'export {}')
      assert.notEqual(indexSource, '')
    } else {
      assert.equal(indexSource, 'export {}')
    }
  }
})

test('domain-neutral packages have no browser or React surface', () => {
  for (const packageName of ['core', 'schema', 'validators']) {
    const packageRoot = `packages/${packageName}`
    const manifest = readJson(`${packageRoot}/package.json`)
    const tsconfig = readJson(`${packageRoot}/tsconfig.json`)

    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      assert.equal(
        allowedNeutralDependencies.has(dependencyName),
        true,
        `unerlaubte Laufzeit-Dependency in ${packageName}: ${dependencyName}`,
      )
      assert.doesNotMatch(
        dependencyName,
        forbiddenDependencyPattern,
        `Browser-/React-/Build-Dependency in ${packageName}: ${dependencyName}`,
      )
    }
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
