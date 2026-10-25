import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const webSource = resolve(repositoryRoot, 'apps/web/src')

// Die Web-Suite (vitest.config.ts) führt nur `*.test.tsx` aus. Tests mit
// anderer Endung liefen sonst unbemerkt nie und zählten in der Abdeckung
// als Quellcode.
test('Web-Tests enden auf .test.tsx, damit die Suite sie ausführt', () => {
  const misnamed = readdirSync(webSource, { recursive: true })
    .map(String)
    .filter((path) => /\.(test|spec)\.(ts|js|jsx|mts|cts)$/u.test(path))
    .map((path) => relative(repositoryRoot, resolve(webSource, path)))
  assert.deepEqual(misnamed, [])
})
