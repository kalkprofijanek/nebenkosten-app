/**
 * Zähler und Ablesungen (Masterplan 5.1). Meter ist Stammdaten-Ebene,
 * MeterReading und MeterBillingStatus sind abrechnungsjahresbezogen.
 */
import { z } from 'zod'
import { legacyUnmappedSchema } from './shared'
import {
  entityIdSchema,
  isoDateSchema,
  moneyCentsSchema,
  quantitySchema,
} from '../primitives'

/** Zählerart (Legacy `art`): Allgemeinstrom oder Wärmeerzeugung. */
export const meterKindSchema = z.enum(['general', 'heat'])
export type MeterKind = z.infer<typeof meterKindSchema>

/**
 * Verknüpfung eines Wärmezählers mit einer Energiequelle (Legacy
 * `heizkreis_id` im Format `<blockId>:<quelleId>`, z. B. `B3:haupt`).
 */
export const meterEnergySourceRefSchema = z.strictObject({
  heatingCircuitBuildingId: entityIdSchema,
  energySourceKey: z.string().min(1),
})
export type MeterEnergySourceRef = z.infer<typeof meterEnergySourceRefSchema>

/**
 * Meter / Zähler (Legacy: `Objekt.stromzaehler[]`, jahresunabhängig).
 */
export const meterSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  kind: meterKindSchema,
  address: z.string().nullish(),
  meterNumber: z.string().nullish(),
  /** Marktlokations-ID (Legacy `malo_id`). */
  maloId: z.string().nullish(),
  provider: z.string().nullish(),
  /** Vertrags-/Kontonummer für den Buchungstext-Abgleich. */
  contractOrAccountNumber: z.string().nullish(),
  energySourceRef: meterEnergySourceRefSchema.nullish(),
  validFrom: isoDateSchema.nullish(),
  validTo: isoDateSchema.nullish(),
  meterNumberStatus: z.enum(['open', 'confirmed']).nullish(),
  note: z.string().nullish(),
  additionalNote: z.string().nullish(),
})
export type Meter = z.infer<typeof meterSchema>

/**
 * MeterReading / Ablesung eines Zählers. Im Legacy-Format existieren
 * Ablesungen nicht als eigene Entität (nur aggregierte Werte auf dem
 * Nutzer); die Entität ist für die neue Erfassung vorgesehen.
 */
export const meterReadingSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  meterId: entityIdSchema,
  billingPeriodId: entityIdSchema.nullish(),
  date: isoDateSchema.nullish(),
  value: quantitySchema,
  source: z.enum(['manual', 'imported', 'estimated']).nullish(),
  note: z.string().nullish(),
})
export type MeterReading = z.infer<typeof meterReadingSchema>

/**
 * Jahresbezogener Checklisten-Status eines Zählers (Legacy
 * `Stromzaehler.jahresstatus[jahr]`) — bewusst rein manuell gepflegt,
 * kein Auto-Matching (Legacy-Entscheidung).
 */
export const meterBillingStatusSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  meterId: entityIdSchema,
  /**
   * Leer, wenn der Legacy-Jahresstatus auf ein Jahr ohne angelegte
   * BillingPeriod zeigt (docs/MIGRATION.md 4.11) — der Eintrag wird
   * trotzdem konserviert und per warning gemeldet.
   */
  billingPeriodId: entityIdSchema.nullish(),
  /** Legacy-Jahresschluessel, traegt das Jahr auch ohne BillingPeriod. */
  year: z.int().min(1900).max(2200).nullish(),
  bookingPresent: z.boolean().nullish(),
  annualInvoicePresent: z.boolean().nullish(),
  note: z.string().nullish(),
  estimateAmountCents: moneyCentsSchema.nullish(),
  estimateReason: z.string().nullish(),
})
export type MeterBillingStatus = z.infer<typeof meterBillingStatusSchema>
