import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_IGNORE_RULES = Object.freeze([
  'private-data/',
  '*.bak',
  '*.backup',
  '*.tmp',
  'nk-daten.json',
  '.env',
  '.env.*',
  'node_modules/',
  'dist/',
])

export const LEGACY_REFERENCE_SHA256 =
  '30995a442892f66bb8dcdaa55cb684c17ee59836e5b9a3ef16fc271f83f42095'

const IGNORE_PROBES = Object.freeze([
  ['private-data/', 'private-data/probe.json'],
  ['*.bak', 'probe.bak'],
  ['*.backup', 'probe.backup'],
  ['*.tmp', 'probe.tmp'],
  ['nk-daten.json', 'nk-daten.json'],
  ['.env', '.env'],
  ['.env.*', '.env.production'],
  ['node_modules/', 'node_modules/probe.js'],
  ['dist/', 'dist/probe.js'],
])

const LOCAL_GIT_ENVIRONMENT_VARIABLES = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
])

const REQUIRED_FILES = Object.freeze([
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'SECURITY.md',
  '.github/workflows/guardrails.yml',
  'legacy/index.html',
  'legacy/SHA256SUMS',
])

export function calculateSha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function createIsolatedGitEnvironment(environment = process.env) {
  const isolatedEnvironment = { ...environment }
  for (const variable of LOCAL_GIT_ENVIRONMENT_VARIABLES) {
    delete isolatedEnvironment[variable]
  }
  for (const variable of Object.keys(isolatedEnvironment)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/u.test(variable)) {
      delete isolatedEnvironment[variable]
    }
  }
  return isolatedEnvironment
}

export function findMissingIgnoreRules(gitignore) {
  const configuredRules = new Set(
    gitignore
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  )

  return REQUIRED_IGNORE_RULES.filter((rule) => !configuredRules.has(rule))
}

export function findForbiddenTrackedFiles(trackedFiles) {
  return trackedFiles.filter((file) => {
    const normalizedPath = file.replaceAll('\\', '/').toLowerCase()
    const segments = normalizedPath.split('/')
    const fileName = segments.at(-1) ?? ''

    if (normalizedPath.startsWith('private-data/')) return true
    if (fileName === 'nk-daten.json') return true
    if (fileName === '.env.example') return false
    if (fileName === '.env' || fileName.startsWith('.env.')) return true
    if (/\.(?:bak|backup|tmp)$/u.test(fileName)) return true
    return segments.includes('node_modules') || segments.includes('dist')
  })
}

function findIneffectiveIgnoreRules(repositoryRoot, gitEnvironment) {
  return IGNORE_PROBES.filter(([, probePath]) => {
    const result = spawnSync(
      'git',
      ['check-ignore', '--no-index', '--quiet', '--', probePath],
      { cwd: repositoryRoot, env: gitEnvironment },
    )
    return result.status !== 0
  }).map(([rule]) => rule)
}

function parseExpectedLegacyHash(checksumFile) {
  const match = checksumFile.trim().match(/^([a-f0-9]{64})\s+\*?index\.html$/iu)
  if (!match) throw new Error('legacy/SHA256SUMS has an invalid format')
  return match[1].toLowerCase()
}

export function verifyRepository(
  repositoryRoot,
  {
    gitEnvironment = process.env,
    legacyReferenceHash = LEGACY_REFERENCE_SHA256,
  } = {},
) {
  const failures = []

  for (const relativePath of REQUIRED_FILES) {
    if (!existsSync(resolve(repositoryRoot, relativePath))) {
      failures.push(`Required file is missing: ${relativePath}`)
    }
  }

  const gitignorePath = resolve(repositoryRoot, '.gitignore')
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf8')
    const missingRules = findMissingIgnoreRules(gitignore)
    if (missingRules.length > 0) {
      failures.push(`Missing .gitignore rules: ${missingRules.join(', ')}`)
    }
    const ineffectiveRules = findIneffectiveIgnoreRules(
      repositoryRoot,
      gitEnvironment,
    )
    if (ineffectiveRules.length > 0) {
      failures.push(`Ineffective .gitignore rules: ${ineffectiveRules.join(', ')}`)
    }
  }

  const checksumPath = resolve(repositoryRoot, 'legacy/SHA256SUMS')
  const legacyPath = resolve(repositoryRoot, 'legacy/index.html')
  let actualHash = null
  if (existsSync(checksumPath)) {
    try {
      const expectedHash = parseExpectedLegacyHash(
        readFileSync(checksumPath, 'utf8'),
      )
      if (expectedHash !== legacyReferenceHash) {
        failures.push(
          `Legacy checksum baseline mismatch: expected ${legacyReferenceHash}, received ${expectedHash}`,
        )
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Invalid legacy checksum')
    }
  }
  if (existsSync(legacyPath)) {
    actualHash = calculateSha256(readFileSync(legacyPath))
    if (actualHash !== legacyReferenceHash) {
      failures.push(
        `Legacy file mismatch: expected ${legacyReferenceHash}, received ${actualHash}`,
      )
    }
  }

  const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: gitEnvironment,
  })
    .split('\0')
    .filter(Boolean)
  const forbiddenFiles = findForbiddenTrackedFiles(trackedFiles)
  if (forbiddenFiles.length > 0) {
    failures.push(`Forbidden tracked files: ${forbiddenFiles.join(', ')}`)
  }

  return Object.freeze({
    actualHash,
    failures: Object.freeze([...failures]),
  })
}

function runCli() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = verifyRepository(repositoryRoot)

  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`ERROR: ${failure}`)
    process.exitCode = 1
    return
  }

  console.log(`Repository guardrails passed. Legacy SHA-256: ${result.actualHash}`)
}

const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false
if (isCli) runCli()
