/**
 * Gemeinsame Bausteine des Legacy-v3-Schemas.
 *
 * Grundsätze (siehe legacy/behavior-map.md, Abschnitte 3 und 8.2):
 * - Das Legacy-Format besitzt keine Laufzeitvalidierung. Felder können in
 *   der Praxis fehlen, `null`, leere Strings oder falsch typisiert sein.
 *   Die v3-Schemas sind deshalb bewusst tolerant: sie dokumentieren die
 *   bekannte Struktur, lehnen aber nur strukturell Unbrauchbares ab.
 * - Alle Objekte sind `loose` (Zod `looseObject`): unbekannte Felder
 *   bleiben beim Parsen erhalten und werden niemals still verworfen
 *   (Masterplan-Akzeptanz PR 03). Die Migration (PR 04) entscheidet
 *   dokumentiert über jedes Feld.
 */
import { z } from 'zod'

/**
 * Legacy-Zahlwert: in der Praxis Zahl, aber auch String (Formulareingabe),
 * `null` oder leerer String beobachtbar (behavior-map 8.2). Die
 * Interpretation (inkl. deutschem Zahlenformat) ist Aufgabe der Migration.
 */
export const v3NumberishSchema = z.union([z.number(), z.string(), z.null()])
export type V3Numberish = z.infer<typeof v3NumberishSchema>

/** Legacy-Boolean: teils echte Booleans, teils 0/1 oder Strings. */
export const v3BooleanishSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
])
export type V3Booleanish = z.infer<typeof v3BooleanishSchema>

/** Legacy-String (nullable, kein Formatzwang). */
export const v3StringishSchema = z.union([z.string(), z.null()])
export type V3Stringish = z.infer<typeof v3StringishSchema>

/**
 * Legacy-Datum: ISO `YYYY-MM-DD` erwartet, aber nicht erzwungen.
 * Formatprüfung + Warnung ist Aufgabe der Migration.
 */
export const v3DateishSchema = v3StringishSchema

/** Legacy-ID (`uid('f')` → `f_ab12cd3` u. ä.). */
export const v3IdSchema = z.string().min(1)
