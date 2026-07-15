import { describe, expect, it } from 'vitest'

import {
  probeSchemaVersion,
  v3FileSchema,
  v3KostenartSchema,
  v3NutzerSchema,
} from '../src'
import { createFictionalV3File } from './fixtures'

describe('v3FileSchema (Legacy-Format)', () => {
  it('akzeptiert eine vollständige fiktive v3-Datei', () => {
    const parsed = v3FileSchema.safeParse(createFictionalV3File())
    expect(parsed.success).toBe(true)
  })

  it('erhält unbekannte Felder auf allen Ebenen (kein stilles Verwerfen)', () => {
    const file = createFictionalV3File()
    const parsed = v3FileSchema.parse(file)

    // Root-Ebene:
    expect(parsed._experimentelles_rootfeld).toEqual({
      hinweis: 'bleibt erhalten',
    })

    // Block-Ebene (inkl. dokumentiertem Altfeld `hk`):
    const firma = parsed.firmen[0]!
    const objekt = (firma.objekte as Record<string, unknown>[])[0]!
    const block = (objekt.bloecke as Record<string, unknown>[])[0]!
    expect(block.zukunftsfeld_block).toBe('bleibt')
    expect(block.hk).toBe('HK-ALT')

    // Nutzer-Ebene:
    const abrechnung = (objekt.abrechnungen as Record<string, unknown>[])[0]!
    const nutzer = (abrechnung.nutzer as Record<string, unknown>[])[0]!
    expect(nutzer._zukunftsfeld_nutzer).toBe('bleibt')
  })

  it('Roundtrip: parse → serialize → parse erhält den Datenbestand', () => {
    const first = v3FileSchema.parse(createFictionalV3File())
    const second = v3FileSchema.parse(JSON.parse(JSON.stringify(first)))
    expect(second).toEqual(first)
  })

  it('lehnt Dateien ohne firmen-Array ab', () => {
    expect(v3FileSchema.safeParse({ version: 3 }).success).toBe(false)
    expect(
      v3FileSchema.safeParse({ version: 3, firmen: 'keins' }).success,
    ).toBe(false)
  })

  it('lehnt andere Schema-Versionen ab (niemals als v3 interpretieren)', () => {
    const file = createFictionalV3File()
    expect(v3FileSchema.safeParse({ ...file, version: 4 }).success).toBe(false)
    expect(v3FileSchema.safeParse({ ...file, version: 2 }).success).toBe(false)
    const ohneVersion: Record<string, unknown> = { ...file }
    delete ohneVersion.version
    expect(v3FileSchema.safeParse(ohneVersion).success).toBe(false)
  })

  it('toleriert Legacy-Typabweichungen (String/null statt Zahl)', () => {
    // behavior-map 8.2: keine Laufzeitvalidierung im Bestand — Beträge
    // können als String, null oder leerer String vorliegen.
    expect(
      v3KostenartSchema.safeParse({
        id: 'k_test009',
        typ: 'betrieb',
        betrag: '1200,50',
      }).success,
    ).toBe(true)
    expect(
      v3NutzerSchema.safeParse({
        id: 'n_test009',
        flaeche_nf: null,
        personen: '',
        eingezogen: '',
      }).success,
    ).toBe(true)
  })

  it('lehnt strukturell unbrauchbare Entitäten ab (fehlende ID)', () => {
    expect(v3KostenartSchema.safeParse({ typ: 'betrieb' }).success).toBe(false)
    expect(v3NutzerSchema.safeParse({ nr: 1 }).success).toBe(false)
  })
})

describe('probeSchemaVersion (Versions-Erkennung, Masterplan 9.2)', () => {
  it('erkennt Legacy v3', () => {
    expect(probeSchemaVersion(createFictionalV3File())).toEqual({
      kind: 'legacy-v3',
    })
  })

  it('erkennt das aktuelle Format', () => {
    expect(probeSchemaVersion({ schemaVersion: 4 })).toEqual({
      kind: 'current',
      schemaVersion: 4,
    })
  })

  it('markiert neuere Versionen als nicht unterstützt (nie überschreiben)', () => {
    expect(probeSchemaVersion({ schemaVersion: 5 })).toEqual({
      kind: 'newer-than-supported',
      schemaVersion: 5,
    })
    expect(probeSchemaVersion({ version: 7 })).toEqual({
      kind: 'newer-than-supported',
      schemaVersion: 7,
    })
  })

  it('liefert unknown für Fremdformate', () => {
    expect(probeSchemaVersion(null)).toEqual({ kind: 'unknown' })
    expect(probeSchemaVersion({ irgendwas: true })).toEqual({
      kind: 'unknown',
    })
    expect(probeSchemaVersion({ version: 1 })).toEqual({ kind: 'unknown' })
  })
})
