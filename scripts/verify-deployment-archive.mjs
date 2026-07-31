import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  inspectDeploymentEntries,
  isForbiddenDeploymentPath,
} from './verify-deployment-artifact.mjs'

const BLOCK_BYTES = 512
const MAXIMUM_ARCHIVE_BYTES = 30 * 1024 * 1024
const MAXIMUM_ENTRY_COUNT = 400

function fieldText(block, start, length) {
  return block
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/su, '')
    .trim()
}

function octalField(block, start, length) {
  const value = fieldText(block, start, length)
  if (!/^[0-7]+$/u.test(value)) throw new Error('invalid tar numeric field')
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('invalid tar numeric field')
  }
  return parsed
}

function normalizedArchivePath(block) {
  const name = fieldText(block, 0, 100)
  const prefix = fieldText(block, 345, 155)
  const combined = prefix === '' ? name : `${prefix}/${name}`
  return combined.startsWith('./') ? combined.slice(2) : combined
}

function verifyHeaderChecksum(block) {
  const expected = octalField(block, 148, 8)
  let actual = 0
  for (let index = 0; index < BLOCK_BYTES; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : block[index]
  }
  if (actual !== expected) throw new Error('invalid tar header checksum')
}

function isZeroBlock(block) {
  return block.every((value) => value === 0)
}

export function verifyDeploymentArchiveBytes(bytes) {
  const failures = []
  const entries = []
  if (bytes.byteLength > MAXIMUM_ARCHIVE_BYTES) {
    return Object.freeze({
      failures: Object.freeze(['Deployment archive exceeds size limit']),
      fileCount: 0,
      totalBytes: 0,
    })
  }

  try {
    if (bytes.byteLength % BLOCK_BYTES !== 0) {
      throw new Error('misaligned tar archive')
    }
    let offset = 0
    let entryCount = 0
    let terminated = false
    while (offset + BLOCK_BYTES <= bytes.byteLength) {
      const header = bytes.subarray(offset, offset + BLOCK_BYTES)
      if (isZeroBlock(header)) {
        if (
          bytes.byteLength - offset < BLOCK_BYTES * 2 ||
          !isZeroBlock(bytes.subarray(offset))
        ) {
          throw new Error('invalid tar terminator')
        }
        terminated = true
        break
      }
      verifyHeaderChecksum(header)
      entryCount += 1
      if (entryCount > MAXIMUM_ENTRY_COUNT) {
        throw new Error('too many tar entries')
      }

      const relativePath = normalizedArchivePath(header)
      const size = octalField(header, 124, 12)
      const type = String.fromCharCode(header[156] ?? 0)
      const contentStart = offset + BLOCK_BYTES
      const contentEnd = contentStart + size
      if (contentEnd > bytes.byteLength) throw new Error('truncated tar entry')
      const nextOffset =
        contentStart + Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES
      if (!isZeroBlock(bytes.subarray(contentEnd, nextOffset))) {
        throw new Error('non-zero tar padding')
      }

      if (type === '0' || type === '\0') {
        entries.push(
          Object.freeze({
            content: Buffer.from(bytes.subarray(contentStart, contentEnd)),
            kind: 'file',
            relativePath,
            size,
          }),
        )
      } else if (type === '5') {
        if (size !== 0) throw new Error('directory payload is forbidden')
        const directoryPath = relativePath.replace(/\/$/u, '')
        if (directoryPath !== '' && isForbiddenDeploymentPath(directoryPath)) {
          failures.push(`Forbidden deployment path: ${directoryPath}`)
        }
      } else {
        entries.push(
          Object.freeze({
            content: Buffer.alloc(0),
            kind: 'archive-link-or-special',
            relativePath,
            size,
          }),
        )
      }

      offset = nextOffset
    }
    if (!terminated) throw new Error('missing tar terminator')
  } catch {
    failures.push('Deployment archive is malformed or unsupported')
  }

  const inspected = inspectDeploymentEntries(entries)
  return Object.freeze({
    ...inspected,
    failures: Object.freeze([...new Set([...failures, ...inspected.failures])]),
  })
}

export function verifyDeploymentArchive(path) {
  try {
    return verifyDeploymentArchiveBytes(readFileSync(resolve(path)))
  } catch {
    return Object.freeze({
      failures: Object.freeze(['Deployment archive is missing or unreadable']),
      fileCount: 0,
      totalBytes: 0,
    })
  }
}

function runCli() {
  const path = process.argv[2]
  if (!path) {
    console.error('ERROR: deployment archive path is required')
    process.exitCode = 1
    return
  }
  const result = verifyDeploymentArchive(path)
  if (result.failures.length === 0) {
    console.log(
      `Deployment archive passed: ${result.fileCount} files, ${result.totalBytes} bytes.`,
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
