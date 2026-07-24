import { describe, expect, it, vi } from 'vitest'
import { blobBytes, downloadBlob, sha256Hex } from './render'

describe('sha256Hex', () => {
  it('berechnet einen stabilen SHA-256-Hex-Wert', async () => {
    const bytes = new TextEncoder().encode('hallo')
    const hash = await sha256Hex(bytes)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256Hex(bytes)).toBe(hash)
  })
})

describe('blobBytes', () => {
  it('liest die Bytes eines Blobs', async () => {
    const blob = new Blob(['hallo'], { type: 'application/pdf' })
    const bytes = await blobBytes(blob)
    expect(new TextDecoder().decode(bytes)).toBe('hallo')
  })
})

describe('downloadBlob', () => {
  it('erzeugt einen Anchor-Klick und widerruft die Object-URL', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    downloadBlob(new Blob(['x']), 'test.pdf')

    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    clickSpy.mockRestore()
    vi.useRealTimers()
  })
})
