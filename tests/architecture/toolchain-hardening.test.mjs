import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8')

test('Abhängigkeiten dürfen beim Installieren keine Skripte ausführen', () => {
  const workspace = read('pnpm-workspace.yaml')
  assert.match(workspace, /^strictDepBuilds: true$/mu)
  assert.match(workspace, /^allowBuilds: \{\}$/mu)
})

test('pnpm ist mit Version und sha512 festgelegt und wird daraus aktiviert', () => {
  const { packageManager } = JSON.parse(read('package.json'))
  assert.match(packageManager, /^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/u)
  const action = read('.github/actions/setup-workspace/action.yml')
  assert.match(action, /corepack prepare --activate/u)
  assert.doesNotMatch(action, /corepack prepare pnpm@/u)
})

test('CLI-Skripte starten Vite ohne HMR-WebSocket', () => {
  const scripts = readdirSync(resolve(repositoryRoot, 'scripts')).filter(
    (name) => name.endsWith('.mjs'),
  )
  const withServer = scripts.filter((name) =>
    read(`scripts/${name}`).includes('createServer('),
  )
  assert.ok(withServer.length > 0)
  for (const name of withServer)
    assert.match(
      read(`scripts/${name}`),
      /server: \{ middlewareMode: true, hmr: false, ws: false \}/u,
      name,
    )
})
