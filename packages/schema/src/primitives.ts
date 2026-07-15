/**
 * Technische Grundbausteine des Ziel-Datenmodells (Masterplan 5.3).
 *
 * Verbindliche Konventionen:
 * - IDs sind stabile, nicht-leere Strings. Neu erzeugte IDs sind UUIDs (v4);
 *   aus Schema v3 migrierte IDs behalten ihre Legacy-Form (z. B. `f_ab12cd3`),
 *   damit Referenzen beim Import stabil bleiben.
 * - Datumswerte: ISO `YYYY-MM-DD` (kalendarisch gültig).
 * - Zeitstempel: ISO-8601 mit Zeitzone (`Z` oder Offset).
 * - Geldbeträge: ganze Centwerte (Integer), niemals Fließkomma-Euro.
 * - Mengen: Dezimalwert + explizite Einheit (`Quantity`).
 * - Prozentwerte: Zahl 0–100, niemals formatierte Strings.
 * - `undefined` (Feld fehlt) = „nicht erfasst“, `null` = „bewusst als nicht
 *   vorhanden erfasst“, `0` = echter Wert Null. Diese drei Zustände müssen
 *   unterscheidbar bleiben; Schemas verwenden dafür `.nullish()` bzw.
 *   `.nullable()` und niemals stille Defaults auf `0`.
 */
import { z } from 'zod'

/** Aktuelle Schema-Version des neuen Dateiformats. */
export const CURRENT_SCHEMA_VERSION = 4 as const

/** Schema-Version des Legacy-Formats (`APP_SCHEMA_VERSION` der Alt-App). */
export const LEGACY_V3_SCHEMA_VERSION = 3 as const

/**
 * Stabile Entitäts-ID. Neu erzeugte IDs müssen UUIDs sein (`uuidSchema`),
 * migrierte Legacy-IDs bleiben erhalten (Präfix-Form der Alt-App).
 */
export const entityIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:.-]+$/, {
    message: 'ID darf nur A-Z, a-z, 0-9, "_", ":", "." und "-" enthalten',
  })
export type EntityId = z.infer<typeof entityIdSchema>

/** UUID für neu erzeugte Entitäten. */
export const uuidSchema = z.uuid()

/** ISO-Datum `YYYY-MM-DD`, kalendarisch gültig. */
export const isoDateSchema = z.iso.date()
export type IsoDate = z.infer<typeof isoDateSchema>

/** ISO-8601-Zeitstempel mit Zeitzone (`Z` oder `+HH:MM`/`-HH:MM`). */
export const isoTimestampSchema = z.iso.datetime({ offset: true })
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>

/**
 * Geldbetrag in ganzen Cent. Vorzeichen erlaubt (Gutschriften/Ausgaben).
 * Fließkommawerte werden abgelehnt — Konvertierung aus Euro passiert
 * ausschließlich dokumentiert in der Migration (siehe docs/MIGRATION.md).
 */
export const moneyCentsSchema = z.int().min(-9_007_199_254_740_991)
export type MoneyCents = z.infer<typeof moneyCentsSchema>

/** Nicht-negativer Centbetrag (z. B. Vorauszahlungen, Bestandswerte). */
export const nonNegativeMoneyCentsSchema = z.int().nonnegative()

/** Prozentwert 0–100 als Zahl (keine formatierten Strings). */
export const percentSchema = z.number().finite().min(0).max(100)
export type Percent = z.infer<typeof percentSchema>

/** Zulässige Mengeneinheiten. */
export const quantityUnitSchema = z.enum([
  'l', // Liter (z. B. Heizöl)
  'kg', // Kilogramm (z. B. Pellets)
  't', // Tonnen
  'kWh', // Kilowattstunden (Strom, Gas, Fernwärme)
  'm3', // Kubikmeter (Wasser, Gas)
  'm2', // Quadratmeter (Flächen)
  'einheiten', // HKV-Verbrauchseinheiten
  'personen', // Personenzahl
  'stueck', // Stückzahl (z. B. Wohneinheiten)
])
export type QuantityUnit = z.infer<typeof quantityUnitSchema>

/** Menge mit expliziter Einheit und Dezimalwert (Masterplan 5.3). */
export const quantitySchema = z.strictObject({
  value: z.number().finite(),
  unit: quantityUnitSchema,
})
export type Quantity = z.infer<typeof quantitySchema>

/** Nicht-leerer Freitext (getrimmt validiert, aber unverändert gespeichert). */
export const nonEmptyStringSchema = z.string().min(1)
