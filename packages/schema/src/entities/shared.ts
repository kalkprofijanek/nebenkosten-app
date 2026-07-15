/**
 * Gemeinsame Wertobjekte, die von mehreren Entitäten verwendet werden.
 */
import { z } from 'zod'
import { entityIdSchema } from '../primitives'

/**
 * Verlustfrei konservierte, unbekannte Legacy-Felder (docs/MIGRATION.md
 * Abschnitt 6). Jede persistierte Entität führt dieses Feld, damit der
 * Migrationsvertrag „kein stilles Verwerfen“ (Masterplan 9.2/25) im
 * Zielformat tatsächlich erfüllbar ist; die Migration listet die Pfade
 * zusätzlich in `report.unmappedFields`.
 */
export const legacyUnmappedSchema = z.record(z.string(), z.unknown())
export type LegacyUnmapped = z.infer<typeof legacyUnmappedSchema>

/**
 * Postanschrift. `postalCodeAndCity` wird bewusst als kombiniertes Feld
 * geführt, weil das Legacy-Format (`plz_ort`) nicht verlustfrei in PLZ und
 * Ort zerlegbar ist. Eine spätere Normalisierung ist eine eigene, bewusste
 * Datenpflege-Aufgabe, keine stille Migrationstransformation.
 */
export const addressSchema = z.strictObject({
  street: z.string().nullish(),
  postalCodeAndCity: z.string().nullish(),
})
export type Address = z.infer<typeof addressSchema>

/** Bankverbindung. IBAN-Formatprüfung ist Aufgabe der Validatoren (PR 10). */
export const bankAccountSchema = z.strictObject({
  iban: z.string().nullish(),
  bic: z.string().nullish(),
  accountHolder: z.string().nullish(),
  bankName: z.string().nullish(),
})
export type BankAccount = z.infer<typeof bankAccountSchema>

/** Anrede-Katalog (Legacy `ANREDE` ohne Leerwert; leer = nicht erfasst). */
export const salutationSchema = z.enum(['Herr', 'Frau', 'Familie', 'Firma'])
export type Salutation = z.infer<typeof salutationSchema>

/** Kontaktperson (Legacy `Firma.ansprechpartner`). */
export const contactPersonSchema = z.strictObject({
  salutation: salutationSchema.nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  phone: z.string().nullish(),
  mobile: z.string().nullish(),
  fax: z.string().nullish(),
  email: z.string().nullish(),
})
export type ContactPerson = z.infer<typeof contactPersonSchema>

/**
 * Kosten-/Nutzer-Geltungsbereich (Legacy `scope_key`, `kosten_scope`,
 * `grundsteuer_key`): entweder das ganze Objekt, ein Heizkreis-Gebäudeblock
 * (`building`, Legacy-Block-ID `B1`…) oder ein Haus-Schlüssel (`house`,
 * Legacy `hausKeyVonRef`-Ableitung aus der Mandatsreferenz).
 */
export const allocationScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('property') }),
  z.strictObject({ kind: z.literal('building'), buildingId: entityIdSchema }),
  z.strictObject({ kind: z.literal('house'), houseKey: z.string().min(1) }),
])
export type AllocationScope = z.infer<typeof allocationScopeSchema>

/** Verknüpfung eines Belegs/einer Lieferung mit einer Kontobuchung. */
export const bookingLinkSchema = z.strictObject({
  bankBookingId: entityIdSchema,
  splitId: entityIdSchema.nullish(),
})
export type BookingLink = z.infer<typeof bookingLinkSchema>

/** Manuelle Bestätigung „extern bezahlt“ statt Buchungsverknüpfung. */
export const externalPaymentSchema = z.strictObject({
  confirmed: z.boolean(),
  reason: z.string().nullish(),
})
export type ExternalPayment = z.infer<typeof externalPaymentSchema>

/** Manuell übernommener Schätzwert inklusive Begründung. */
export const estimateSchema = z.strictObject({
  isEstimated: z.boolean(),
  reason: z.string().nullish(),
})
export type Estimate = z.infer<typeof estimateSchema>

/**
 * Angehängte Beleg-Datei (Base64). Harte Obergrenzen gegen entartete
 * Importe: Dateiname/MIME begrenzt, Inhalt max. ~15 MB binär
 * (20 Mio. Base64-Zeichen). Feinere Typ-/Inhaltsprüfung: Validatoren.
 */
export const fileAttachmentSchema = z.strictObject({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  dataBase64: z.string().min(1).max(20_000_000),
})
export type FileAttachment = z.infer<typeof fileAttachmentSchema>
