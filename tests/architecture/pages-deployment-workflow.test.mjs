import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workflow = readFileSync(
  resolve(repositoryRoot, '.github/workflows/pages.yml'),
  'utf8',
)
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
)

test('Pages deployment stays manual until explicit release approval', () => {
  assert.match(workflow, /workflow_dispatch:/u)
  assert.doesNotMatch(workflow, /^\s+push:/mu)
  assert.doesNotMatch(workflow, /^\s+pull_request:/mu)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u)
})

test('build job is read-only and uploads a prebuilt immutable archive', () => {
  assert.match(workflow, /build:[\s\S]*?permissions:\s*\n\s+contents: read/u)
  assert.match(workflow, /persist-credentials: false/u)
  assert.match(workflow, /run: pnpm privacy:scan/u)
  assert.match(workflow, /run: pnpm build/u)
  assert.match(workflow, /run: pnpm verify:deployment-artifact/u)
  assert.match(workflow, /tar[\s\S]*artifact\.tar/u)
  assert.doesNotMatch(workflow, /--dereference|--hard-dereference/u)
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/u)
  assert.match(workflow, /name: github-pages/u)
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/artifact\.tar/u)
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact@/u)

  const archiveOffset = workflow.indexOf('-cvf "${RUNNER_TEMP}/artifact.tar"')
  const uploadOffset = workflow.indexOf('actions/upload-artifact@')
  assert.equal(archiveOffset >= 0, true)
  assert.equal(uploadOffset > archiveOffset, true)
})

test('a fresh job verifies the immutable uploaded archive before deployment', () => {
  assert.match(workflow, /verify:\s*\n\s+name: pages-artifact-verify/u)
  assert.match(workflow, /verify:[\s\S]*?needs: build/u)
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/u)
  assert.match(workflow, /name: github-pages/u)
  assert.match(
    workflow,
    /run: >-\s+node scripts\/verify-deployment-archive\.mjs/u,
  )
  assert.match(workflow, /deploy:[\s\S]*?needs: \[build, verify\]/u)

  const uploadOffset = workflow.indexOf('actions/upload-artifact@')
  const downloadOffset = workflow.indexOf('actions/download-artifact@')
  const verificationOffset = workflow.indexOf(
    'node scripts/verify-deployment-archive.mjs',
  )
  const deployOffset = workflow.indexOf('deploy:')
  assert.equal(downloadOffset > uploadOffset, true)
  assert.equal(verificationOffset > downloadOffset, true)
  assert.equal(deployOffset > verificationOffset, true)
})

test('local CI verifies the built deployment artifact too', () => {
  assert.match(
    packageJson.scripts.ci,
    /pnpm build && pnpm verify:deployment-artifact/u,
  )
})

test('deploy job has only the Pages permissions and environment contract', () => {
  assert.match(workflow, /deploy:[\s\S]*?needs: \[build, verify\]/u)
  assert.match(workflow, /contents: read/u)
  assert.match(workflow, /pages: write/u)
  assert.match(workflow, new RegExp(['id-token', 'write'].join(': '), 'u'))
  assert.match(workflow, /name: github-pages/u)
  assert.match(workflow, /id: deployment/u)
  assert.match(workflow, /actions\/deploy-pages@[0-9a-f]{40}/u)
})

test('all external workflow actions are pinned to immutable commits', () => {
  const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/gu)].map(
    (match) => match[1],
  )

  assert.equal(actionReferences.length >= 3, true)
  for (const reference of actionReferences) {
    if (reference.startsWith('./')) continue
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/u)
  }
})
