import assert from 'node:assert/strict'
import { test } from 'node:test'

import { verifyDeploymentArchiveBytes } from '../../scripts/verify-deployment-archive.mjs'

const BLOCK_BYTES = 512

function tarEntry(name, content, type = '0', magic = 'ustar\0' + '00') {
  const payload = Buffer.from(content)
  const header = Buffer.alloc(BLOCK_BYTES)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${payload.length.toString(8).padStart(11, '0')}\0`, 124, 12)
  header.write('00000000000\0', 136, 12, 'ascii')
  header.fill(32, 148, 156)
  header.write(type, 156, 1, 'ascii')
  header.write(magic, 257, 8, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  const padding = Buffer.alloc(
    Math.ceil(payload.length / BLOCK_BYTES) * BLOCK_BYTES - payload.length,
  )
  return Buffer.concat([header, payload, padding])
}

function tar(entries) {
  return Buffer.concat([...entries, Buffer.alloc(BLOCK_BYTES * 2)])
}

test('verifies the exact bytes of a static Pages tar archive', () => {
  const result = verifyDeploymentArchiveBytes(
    tar([
      tarEntry('./index.html', '<main></main>'),
      tarEntry('./assets/app.js', 'globalThis.__APP__ = true'),
    ]),
  )

  assert.deepEqual(result.failures, [])
  assert.equal(result.fileCount, 2)
})

test('rejects archive links and corrupted headers', () => {
  const linked = verifyDeploymentArchiveBytes(
    tar([
      tarEntry('./index.html', '<main></main>'),
      tarEntry('./assets/link.js', '', '2'),
    ]),
  )
  assert.ok(
    linked.failures.includes('Deployment links are forbidden: assets/link.js'),
  )

  const corrupted = tar([tarEntry('./index.html', '<main></main>')])
  corrupted[0] ^= 1
  assert.ok(
    verifyDeploymentArchiveBytes(corrupted).failures.includes(
      'Deployment archive is malformed or unsupported',
    ),
  )
})

test('rejects forbidden directories and any unscanned tar bytes', () => {
  const hiddenDirectory = verifyDeploymentArchiveBytes(
    tar([
      tarEntry('./index.html', '<main></main>'),
      tarEntry('./.private/', '', '5'),
    ]),
  )
  assert.ok(
    hiddenDirectory.failures.includes('Forbidden deployment path: .private'),
  )

  const directoryPayload = verifyDeploymentArchiveBytes(
    tar([
      tarEntry('./index.html', '<main></main>'),
      tarEntry('./assets/', 'hidden', '5'),
    ]),
  )
  assert.ok(
    directoryPayload.failures.includes(
      'Deployment archive is malformed or unsupported',
    ),
  )

  const trailingData = tar([tarEntry('./index.html', '<main></main>')])
  trailingData[trailingData.length - 1] = 1
  assert.ok(
    verifyDeploymentArchiveBytes(trailingData).failures.includes(
      'Deployment archive is malformed or unsupported',
    ),
  )
})

test('rejects duplicate archive paths that an extractor would overwrite', () => {
  const result = verifyDeploymentArchiveBytes(
    tar([
      tarEntry('./index.html', '<main></main>'),
      tarEntry('index.html', '<main>other</main>'),
    ]),
  )
  assert.ok(result.failures.includes('Duplicate deployment path: index.html'))
})

test('reads the path prefix only from POSIX ustar headers', () => {
  const oldGnu = tarEntry('./index.html', '<main></main>', '0', 'ustar  \0')
  oldGnu.write('assets', 345, 155, 'utf8')
  let checksum = 0
  oldGnu.fill(32, 148, 156)
  for (const byte of oldGnu.subarray(0, BLOCK_BYTES)) checksum += byte
  oldGnu.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  const result = verifyDeploymentArchiveBytes(tar([oldGnu]))
  assert.deepEqual(result.failures, [])
  assert.equal(result.fileCount, 1)
})

test('rejects headers without a known tar magic', () => {
  const result = verifyDeploymentArchiveBytes(
    tar([tarEntry('./index.html', '<main></main>', '0', 'notar\0\0\0')]),
  )
  assert.ok(
    result.failures.includes('Deployment archive is malformed or unsupported'),
  )
})
