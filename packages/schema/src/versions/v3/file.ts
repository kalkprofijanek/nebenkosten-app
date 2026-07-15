/**
 * Wurzelstruktur einer Legacy-v3-Datei (`Store.data` der Alt-App,
 * `APP_SCHEMA_VERSION = 3`).
 */
import { z } from 'zod'
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_V3_SCHEMA_VERSION,
} from '../../primitives'
import { v3StringishSchema } from './common'
import { v3FirmaSchema } from './entities'

/**
 * Vollständige v3-Datei. `version` muss exakt 3 sein — Dateien mit
 * höherer Version dürfen nicht als v3 interpretiert (und niemals
 * überschrieben) werden; Dateien ohne/mit niedrigerer Version sind kein
 * dokumentierter Bestandszustand und werden abgelehnt (die Alt-App
 * kennt keine v1/v2-Migrationen, behavior-map 4.11).
 */
export const v3FileSchema = z.looseObject({
  version: z.literal(LEGACY_V3_SCHEMA_VERSION),
  /** ISO-Zeitstempel der letzten Speicherung, `null` bei Seed-Daten. */
  gespeichert: v3StringishSchema.optional(),
  firmen: z.array(v3FirmaSchema),
})
export type V3File = z.infer<typeof v3FileSchema>

/**
 * Erkennung der Schema-Version einer unbekannten Eingabe, ohne die
 * Datei vollständig zu validieren (Pipeline-Schritt „Schema-Version
 * erkennen“, Masterplan 9.2).
 */
export const schemaVersionProbeSchema = z.looseObject({
  version: z.number().optional(),
  schemaVersion: z.number().optional(),
})

export type SchemaVersionProbe =
  | { kind: 'legacy-v3' }
  | { kind: 'current'; schemaVersion: number }
  | { kind: 'newer-than-supported'; schemaVersion: number }
  | { kind: 'unknown' }

/** Ermittelt die mutmaßliche Schema-Version einer geparsten JSON-Eingabe. */
export function probeSchemaVersion(input: unknown): SchemaVersionProbe {
  const parsed = schemaVersionProbeSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unknown' }
  const { version, schemaVersion } = parsed.data
  if (typeof schemaVersion === 'number') {
    if (schemaVersion === CURRENT_SCHEMA_VERSION)
      return { kind: 'current', schemaVersion }
    if (schemaVersion > CURRENT_SCHEMA_VERSION)
      return { kind: 'newer-than-supported', schemaVersion }
    return { kind: 'unknown' }
  }
  if (version === LEGACY_V3_SCHEMA_VERSION) return { kind: 'legacy-v3' }
  if (typeof version === 'number' && version > LEGACY_V3_SCHEMA_VERSION)
    return { kind: 'newer-than-supported', schemaVersion: version }
  return { kind: 'unknown' }
}
