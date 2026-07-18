const UUID_BYTE_COUNT = 16

function mix(seed: number, text: string): number {
  let hash = seed >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
    hash ^= hash >>> 13
  }
  return hash >>> 0
}

/** Deterministische UUIDv8 aus Quellhash und stabilem Quellpfad. */
export function deterministicUuid(sourceSha256: string, path: string): string {
  const bytes = new Uint8Array(UUID_BYTE_COUNT)
  const input = `${sourceSha256}:${path}`
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  for (let word = 0; word < seeds.length; word += 1) {
    const hash = mix(seeds[word]!, input)
    for (let byte = 0; byte < 4; byte += 1)
      bytes[word * 4 + byte] = (hash >>> (byte * 8)) & 0xff
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
