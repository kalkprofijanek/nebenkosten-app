/**
 * Importierte Kontobuchungen (Legacy: `Objekt.buchungen[]`).
 *
 * Diese Entität ist eine bewusste Erweiterung der Masterplan-5.1-Liste:
 * Der Buchungsabgleich (CSV-Import, Klassifizierung, Splits,
 * Heizkreis-Zuordnung) ist Bestandsfunktionalität und darf nicht
 * verloren gehen (Masterplan 3). Bankdaten sind grundsätzlich
 * Local-only-Daten und gehören niemals in Fixtures oder GitHub.
 */
import { z } from 'zod'
import {
  entityIdSchema,
  isoDateSchema,
  isoTimestampSchema,
  moneyCentsSchema,
  percentSchema,
} from '../primitives'

/** Buchungskategorien (Legacy `BUCH_KATEGORIEN`). */
export const bankBookingCategorySchema = z.enum([
  'OFFEN',
  'NK_UMLEGBAR',
  'NK_NICHT_UMLEGBAR',
  'MIETEINGANG',
  'KAUTION',
  'INSTANDHALTUNG',
  'VERWALTUNG',
  'SONSTIGE',
])
export type BankBookingCategory = z.infer<typeof bankBookingCategorySchema>

/**
 * Alternative Zuordnung einer Buchung zu einer Heizkreis-Lieferung
 * (Legacy `_heizkreis`/`_hk`, Format `<blockId>:<quelleId>`).
 */
export const bankBookingHeatingTargetSchema = z.strictObject({
  heatingCircuitBuildingId: entityIdSchema,
  energySourceKey: z.string().min(1),
})
export type BankBookingHeatingTarget = z.infer<
  typeof bankBookingHeatingTargetSchema
>

/** Aufteilung einer Buchung auf mehrere Kostenarten/Jahre (Legacy Split). */
export const bankBookingSplitSchema = z.strictObject({
  id: entityIdSchema,
  amountCents: moneyCentsSchema,
  costCategoryId: entityIdSchema.nullish(),
  billingYear: z.int().min(1900).max(2200).nullish(),
  note: z.string().nullish(),
  allocablePercent: percentSchema.nullish(),
  category: bankBookingCategorySchema.nullish(),
  isCaretakerContract: z.boolean().nullish(),
})
export type BankBookingSplit = z.infer<typeof bankBookingSplitSchema>

/**
 * BankBooking / importierte Kontobewegung. Beträge in Cent, Vorzeichen
 * wie im Legacy-Format (Ausgabe negativ).
 */
export const bankBookingSchema = z.strictObject({
  id: entityIdSchema,
  propertyId: entityIdSchema,
  /** Dedupe-Schlüssel aus Datum+Betrag+Auftraggeber+Zweck (Legacy `hash`). */
  dedupeHash: z.string().nullish(),
  date: isoDateSchema.nullish(),
  amountCents: moneyCentsSchema,
  counterparty: z.string().nullish(),
  purpose: z.string().nullish(),
  bookingText: z.string().nullish(),
  category: bankBookingCategorySchema.nullish(),
  note: z.string().nullish(),
  /** Ziel-Zuordnung, falls kein Split verwendet wird. */
  costCategoryId: entityIdSchema.nullish(),
  billingYear: z.int().min(1900).max(2200).nullish(),
  allocablePercent: percentSchema.nullish(),
  splits: z.array(bankBookingSplitSchema).nullish(),
  heatingTarget: bankBookingHeatingTargetSchema.nullish(),
  /** Sperrt weitere Änderungen (Legacy `_geprueft`). */
  reviewed: z.boolean().nullish(),
  /** Hauswartvertrags-Buchung mit spezieller Split-Vorlage (Legacy). */
  isCaretakerContract: z.boolean().nullish(),
  importedAt: isoTimestampSchema.nullish(),
})
export type BankBooking = z.infer<typeof bankBookingSchema>
