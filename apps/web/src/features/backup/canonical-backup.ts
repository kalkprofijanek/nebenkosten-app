import { encodeCurrentAppData } from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'

import { APP_VERSION } from '../../app/version'

export interface CanonicalBackup {
  readonly bytes: Uint8Array
  readonly byteLength: number
  readonly createdAt: string
  readonly fileName: string
  readonly sha256: string
}

export interface BackupDownloadAnchor {
  href: string
  download: string
  click(): void
  remove(): void
}

export interface BackupDownloadPort {
  createObjectUrl(blob: Blob): string
  revokeObjectUrl(url: string): void
  createAnchor(): BackupDownloadAnchor
  appendAnchor(anchor: BackupDownloadAnchor): void
}

function backupFileName(createdAt: string): string {
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('Invalid backup timestamp')
  }
  const compactTimestamp = date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '-')
    .slice(0, 15)
  return `nebenkosten-backup-v4-${compactTimestamp}.json`
}

export async function createCanonicalBackup(
  data: AppDataFile,
  options: { readonly createdAt: Date | string },
): Promise<CanonicalBackup> {
  const encoded = await encodeCurrentAppData(
    { ...data, meta: { ...data.meta, appVersion: APP_VERSION } },
    { savedAt: options.createdAt },
  )
  return {
    bytes: Uint8Array.from(encoded.bytes),
    byteLength: encoded.bytes.byteLength,
    createdAt: encoded.savedAt,
    fileName: backupFileName(encoded.savedAt),
    sha256: encoded.revision,
  }
}

function browserDownloadPort(): BackupDownloadPort {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
  }
}

export function downloadCanonicalBackup(
  backup: CanonicalBackup,
  port: BackupDownloadPort = browserDownloadPort(),
): void {
  const blob = new Blob([Uint8Array.from(backup.bytes)], {
    type: 'application/json',
  })
  const objectUrl = port.createObjectUrl(blob)
  const anchor = port.createAnchor()
  try {
    anchor.href = objectUrl
    anchor.download = backup.fileName
    port.appendAnchor(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    port.revokeObjectUrl(objectUrl)
  }
}
