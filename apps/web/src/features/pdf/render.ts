import type { TDocumentDefinitions } from 'pdfmake/interfaces'

export interface ZipEntry {
  readonly fileName: string
  readonly bytes: Uint8Array
}

/**
 * Lädt `pdfmake` (inkl. Schriftdaten) erst bei tatsächlichem Bedarf nach —
 * das Paket ist mehrere MB groß und soll das Haupt-Bundle sowie die
 * Ein-Datei-HTML-Vorschau nicht aufblähen (PR 11).
 */
async function loadPdfMake() {
  const [pdfMake, vfsFonts] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  pdfMake.addVirtualFileSystem(vfsFonts.default)
  return pdfMake
}

export async function renderPdfBlob(
  docDefinition: TDocumentDefinitions,
): Promise<Blob> {
  const pdfMake = await loadPdfMake()
  return pdfMake.createPdf(docDefinition).getBlob()
}

export async function renderZipBlob(
  entries: readonly ZipEntry[],
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const entry of entries) zip.file(entry.fileName, entry.bytes)
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}
