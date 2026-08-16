import { createHash } from 'node:crypto'
import { existsSync, lstatSync, opendirSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findSensitiveContent } from './scan-repository-content.mjs'

const DEFAULT_LIMITS = Object.freeze({
  maximumDepth: 6,
  maximumEntryCount: 400,
  maximumFileBytes: 5 * 1024 * 1024,
  maximumFileCount: 200,
  maximumTotalBytes: 25 * 1024 * 1024,
})

const ALLOWED_EXTENSIONS = new Set([
  '.css',
  '.gif',
  '.html',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.png',
  '.svg',
  '.ttf',
  '.txt',
  '.webmanifest',
  '.webp',
  '.woff',
  '.woff2',
])

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.svg',
  '.txt',
  '.webmanifest',
])

const FORBIDDEN_PATH_SEGMENTS = new Set(['node_modules', 'private-data'])

const LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:\\Users\\|\/(?:home|Users)\/[^/\s"'`]+)/giu

const REVIEWED_CREDENTIAL_ASSIGNMENTS = new Set([
  // React-DOM: Liste unterstützter HTML-Eingabetypen (Kennwort-Markierung).
  'assets/index-CtQvHfCT.js:2128f58378fb976a7f3b6f87a36bad9529b97695e4f560499daa49b0b443c03c:8',
  'assets/index-BfCfNcqJ.js:2700d13db5986f045005ff204a8747dd632d7934a83a452391f670268e5fea3d:8',
  'assets/index-Do-vMFxR.js:3a6b97aa8a3537acc48a3f0c8ab16f469408f9cd234aadee30d9a89da8753a12:8',
  'assets/index-nTC2rkE6.js:d1e57b07c652b7a48c3b82cbd3c907024b3a4528246adcc945f8b62bca23f177:8',
  'assets/index-B6SEjulx.js:c85dd467881964fb7e676d284a45ec6c7557493aa2cf847f5d0e9101be15b1e5:8',
  // pdfmake: PDF-Widget-Bitmaske für ein Kennwort-Feld.
  'assets/pdfmake-BDdWErbi.js:3197e19df8923c84338402f0cd6ad74efe1ed527f1862e71ce70d928e0d4cc50:100',
  'assets/pdfmake-px1s6AzJ.js:7ff8033e96ecfa1c353331641d6a902e9e00a62836fd248c3edbcd37aa8ece9b:100',
  'assets/pdfmake-DyZZ1eQR.js:e207db1e15e7ab1828fb933fce4c0947f14b052d9b1c09091b9694b79cbd7427:100',
  'assets/pdfmake-DgDUmd0A.js:54073851416e57eb7d783f689981558db0175baa52328f47dafeb498b97c52f4:100',
  'assets/pdfmake-C6en2V08.js:228874318994eb8394641242921723c791b1b7100c96d96ea42a68138a2d7612:100',
])

function normalizedLimits(options = {}) {
  return Object.freeze({ ...DEFAULT_LIMITS, ...options })
}

function normalizedRelativePath(relativePath) {
  return relativePath.replaceAll('\\', '/')
}

export function isForbiddenDeploymentPath(relativePath) {
  const normalizedPath = normalizedRelativePath(relativePath)
  const segments = normalizedPath.split('/')
  return (
    normalizedPath === '' ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalizedPath) ||
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.startsWith('.') ||
        FORBIDDEN_PATH_SEGMENTS.has(segment),
    )
  )
}

function sensitiveContentFailures(relativePath, content) {
  const findings = findSensitiveContent(relativePath, content)
  const digest = createHash('sha256').update(content).digest('hex')
  const failures = findings.map((finding) => {
    const reviewedKey = `${relativePath}:${digest}:${finding.line}`
    return REVIEWED_CREDENTIAL_ASSIGNMENTS.has(reviewedKey) &&
      finding.kind === 'credential assignment'
      ? null
      : `Sensitive deployment content: ${relativePath}:${finding.line} (${finding.kind})`
  })

  for (const match of content.matchAll(LOCAL_PATH_PATTERN)) {
    const line = content.slice(0, match.index).split('\n').length
    failures.push(
      `Sensitive deployment content: ${relativePath}:${line} (local path)`,
    )
  }
  return failures.filter((failure) => failure !== null)
}

export function inspectDeploymentEntries(entries, options = {}) {
  const limits = normalizedLimits(options)
  const failures = []
  let totalBytes = 0
  let hasIndex = false

  for (const entry of entries) {
    const relativePath = normalizedRelativePath(entry.relativePath)
    totalBytes += entry.size
    if (relativePath === 'index.html') hasIndex = true

    if (entry.kind !== 'file') {
      failures.push(`Deployment links are forbidden: ${relativePath}`)
      continue
    }
    if (isForbiddenDeploymentPath(relativePath)) {
      failures.push(`Forbidden deployment path: ${relativePath}`)
      continue
    }
    const extension = extname(relativePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      failures.push(`Forbidden deployment file: ${relativePath}`)
      continue
    }
    if (entry.size > limits.maximumFileBytes) {
      failures.push(`Deployment file exceeds size limit: ${relativePath}`)
      continue
    }
    if (TEXT_EXTENSIONS.has(extension)) {
      failures.push(
        ...sensitiveContentFailures(
          relativePath,
          entry.content.toString('utf8'),
        ),
      )
    }
  }

  if (!hasIndex) {
    failures.push('Required deployment file is missing: index.html')
  }
  if (entries.length > limits.maximumFileCount) {
    failures.push(
      `Deployment contains too many files: ${entries.length} > ${limits.maximumFileCount}`,
    )
  }
  if (totalBytes > limits.maximumTotalBytes) {
    failures.push('Deployment exceeds total size limit')
  }

  return Object.freeze({
    failures: Object.freeze([...new Set(failures)]),
    fileCount: entries.length,
    totalBytes,
  })
}

function collectDeploymentEntries(root, limits) {
  const entries = []
  const failures = []
  let visitedEntryCount = 0
  let entryBudgetExceeded = false

  function visit(directory, depth) {
    if (depth > limits.maximumDepth) {
      failures.push('Deployment directory exceeds depth limit')
      return
    }
    const directoryHandle = opendirSync(directory)
    try {
      while (!entryBudgetExceeded) {
        const directoryEntry = directoryHandle.readSync()
        if (directoryEntry === null) break
        visitedEntryCount += 1
        if (visitedEntryCount > limits.maximumEntryCount) {
          failures.push(
            `Deployment contains too many directory entries: ${visitedEntryCount} > ${limits.maximumEntryCount}`,
          )
          entryBudgetExceeded = true
          break
        }
        if (entries.length > limits.maximumFileCount) break
        const absolutePath = resolve(directory, directoryEntry.name)
        const relativePath = normalizedRelativePath(
          relative(root, absolutePath),
        )
        const statistics = lstatSync(absolutePath)

        if (statistics.isSymbolicLink()) {
          entries.push(
            Object.freeze({
              content: Buffer.alloc(0),
              kind: 'symbolic-link',
              relativePath,
              size: 0,
            }),
          )
          continue
        }
        if (statistics.isDirectory()) {
          visit(absolutePath, depth + 1)
          continue
        }
        if (!statistics.isFile()) {
          entries.push(
            Object.freeze({
              content: Buffer.alloc(0),
              kind: 'special',
              relativePath,
              size: statistics.size,
            }),
          )
          continue
        }

        entries.push(
          Object.freeze({
            content:
              statistics.size <= limits.maximumFileBytes
                ? readFileSync(absolutePath)
                : Buffer.alloc(0),
            kind: 'file',
            relativePath,
            size: statistics.size,
          }),
        )
      }
    } finally {
      directoryHandle.closeSync()
    }
  }

  visit(root, 0)
  return Object.freeze({ entries: Object.freeze(entries), failures })
}

export function verifyDeploymentArtifact(root, options = {}) {
  const limits = normalizedLimits(options)
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    return Object.freeze({
      failures: Object.freeze(['Deployment directory is missing or invalid']),
      fileCount: 0,
      totalBytes: 0,
    })
  }

  const collected = collectDeploymentEntries(resolve(root), limits)
  const inspected = inspectDeploymentEntries(collected.entries, limits)
  return Object.freeze({
    ...inspected,
    failures: Object.freeze([
      ...new Set([...collected.failures, ...inspected.failures]),
    ]),
  })
}

function runCli() {
  const root = process.argv[2]
  if (!root) {
    console.error('ERROR: deployment artifact path is required')
    process.exitCode = 1
    return
  }

  const result = verifyDeploymentArtifact(resolve(root))
  if (result.failures.length === 0) {
    console.log(
      `Deployment artifact passed: ${result.fileCount} files, ${result.totalBytes} bytes.`,
    )
    return
  }
  for (const failure of result.failures) console.error(`ERROR: ${failure}`)
  process.exitCode = 1
}

const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false
if (isCli) runCli()
