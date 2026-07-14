import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXCLUDED_PATHS = new Set(['legacy/index.html', 'pnpm-lock.yaml'])
const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
])
const PLACEHOLDER_VALUES = Object.freeze([
  'example',
  'fixture-only',
  'placeholder',
  'test-only',
])

const CONTENT_PATTERNS = Object.freeze([
  Object.freeze({
    kind: 'email address',
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  }),
  Object.freeze({ kind: 'German IBAN', expression: /\bDE\d{20}\b/gu }),
  Object.freeze({
    kind: 'access token',
    expression:
      /\b(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})\b/gu,
  }),
  Object.freeze({
    kind: 'private key',
    expression: /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
  }),
  Object.freeze({
    kind: 'street address',
    expression:
      /\b[\p{L}.-]{2,}(?:straße|strasse|weg|allee|platz)\s+\d{1,4}[a-z]?\b/giu,
  }),
])

const CREDENTIAL_ASSIGNMENT =
  /\b(?:api[_-]?key|client[_-]?secret|password|passwd|secret|token)\b\s*[:=]\s*["']?([^\s"'`]+)/giu

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split('\n').length
}

function isPlaceholder(value) {
  const normalizedValue = value.toLowerCase().replace(/[<>]/gu, '')
  return PLACEHOLDER_VALUES.some((placeholder) =>
    normalizedValue.includes(placeholder),
  )
}

export function isScannablePath(relativePath) {
  const normalizedPath = relativePath.replaceAll('\\', '/')
  if (EXCLUDED_PATHS.has(normalizedPath)) return false
  return !BINARY_EXTENSIONS.has(extname(normalizedPath).toLowerCase())
}

export function findSensitiveContent(relativePath, content) {
  const findings = []
  const occupiedLines = new Set()

  for (const { expression, kind } of CONTENT_PATTERNS) {
    for (const match of content.matchAll(expression)) {
      const line = lineNumberAt(content, match.index)
      if (occupiedLines.has(line)) continue
      occupiedLines.add(line)
      findings.push(Object.freeze({ kind, line, path: relativePath }))
    }
  }

  for (const match of content.matchAll(CREDENTIAL_ASSIGNMENT)) {
    const value = match[1] ?? ''
    const line = lineNumberAt(content, match.index)
    if (occupiedLines.has(line) || isPlaceholder(value)) continue
    occupiedLines.add(line)
    findings.push(
      Object.freeze({
        kind: 'credential assignment',
        line,
        path: relativePath,
      }),
    )
  }

  return Object.freeze(findings)
}

export function findForbiddenLockfileSources(content) {
  const forbiddenLines = []

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const resolutionMatch = line.match(/^\s*resolution:\s*(.+)$/u)
    const linkMatch = line.match(/\b(?:resolution|version):\s+link:([^\s]+)/u)
    const hasAllowedWorkspaceLink = linkMatch
      ? /^(?:apps|packages)\/[a-z0-9-]+$/u.test(linkMatch[1] ?? '')
      : false
    const hasIntegrityResolution = resolutionMatch
      ? /^\{integrity:\s*sha512-[A-Za-z0-9+/]+={0,2}\}$/u.test(
          resolutionMatch[1] ?? '',
        )
      : false
    const versionValue = line.match(/^\s*version:\s*(.+)$/u)?.[1] ?? ''
    const hasSourceProtocol =
      versionValue.length > 0 &&
      /^(?:file|git|github|gitlab|bitbucket|http|https|ssh):/iu.test(
        versionValue,
      )
    const hasCustomSourceKey =
      /(?:^|[{,]\s*)(?:directory|path|repo|tarball):/iu.test(line)
    const hasForbiddenLink = Boolean(linkMatch) && !hasAllowedWorkspaceLink
    const hasForbiddenResolution =
      Boolean(resolutionMatch) && !hasIntegrityResolution

    if (
      hasSourceProtocol ||
      hasCustomSourceKey ||
      hasForbiddenLink ||
      hasForbiddenResolution
    ) {
      forbiddenLines.push(index + 1)
    }
  }

  return Object.freeze(forbiddenLines)
}

function listCandidatePaths(repositoryRoot) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
}

export function scanRepository(
  repositoryRoot,
  {
    candidatePaths = listCandidatePaths(repositoryRoot),
    readContent = (relativePath) =>
      readFileSync(resolve(repositoryRoot, relativePath)),
  } = {},
) {
  const findings = []

  for (const relativePath of candidatePaths) {
    if (relativePath === 'pnpm-lock.yaml') {
      const lockfile = readContent(relativePath).toString('utf8')
      for (const line of findForbiddenLockfileSources(lockfile)) {
        findings.push(
          Object.freeze({
            kind: 'forbidden lockfile source',
            line,
            path: relativePath,
          }),
        )
      }
      continue
    }

    if (BINARY_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
      findings.push(
        Object.freeze({
          kind: 'tracked binary file',
          line: 1,
          path: relativePath,
        }),
      )
      continue
    }

    if (!isScannablePath(relativePath)) continue
    const content = readContent(relativePath)
    if (content.includes(0)) {
      findings.push(
        Object.freeze({
          kind: 'tracked binary file',
          line: 1,
          path: relativePath,
        }),
      )
      continue
    }
    findings.push(
      ...findSensitiveContent(relativePath, content.toString('utf8')),
    )
  }

  return Object.freeze(findings)
}

function runCli() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const findings = scanRepository(repositoryRoot)

  if (findings.length === 0) {
    console.log('Repository content scan passed.')
    return
  }

  for (const finding of findings) {
    console.error(
      `ERROR: ${finding.path}:${finding.line} contains ${finding.kind}`,
    )
  }
  process.exitCode = 1
}

const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false
if (isCli) runCli()
