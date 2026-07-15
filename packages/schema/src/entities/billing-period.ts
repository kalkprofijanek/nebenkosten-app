/**
 * Abrechnungsjahr (Masterplan 5.1/5.2, Legacy: `Abrechnung`).
 */
import { z } from 'zod'
import { legacyUnmappedSchema } from './shared'
import {
  entityIdSchema,
  isoDateSchema,
  isoTimestampSchema,
  percentSchema,
  quantitySchema,
} from '../primitives'

/**
 * Freigabestatus (Masterplan 7.3). Mapping der Legacy-Statuswerte:
 * `Entwurf` → DRAFT, `Prüfung offen` → IN_REVIEW,
 * `PDF bereit` → READY_FOR_PDF, `abgeschlossen` → FINALIZED,
 * `veraltet` → SUPERSEDED.
 */
export const billingPeriodStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'READY_FOR_PDF',
  'FINALIZED',
  'SUPERSEDED',
])
export type BillingPeriodStatus = z.infer<typeof billingPeriodStatusSchema>

/** Bezugsfläche für den Grundkostenanteil (Legacy `grundkosten_umlage`). */
export const baseCostAreaBasisSchema = z.enum(['usable_area', 'heated_area'])

/**
 * Objektweite Heizungsvorgaben (Legacy `Abrechnung.vorgaben`), je
 * Heizkreis überschreibbar. Prozentwerte als Zahlen 0–100.
 */
export const heatingDefaultsSchema = z.strictObject({
  consumptionSharePercent: percentSchema.nullish(),
  baseSharePercent: percentSchema.nullish(),
  baseCostAreaBasis: baseCostAreaBasisSchema.nullish(),
  solarSharePercent: percentSchema.nullish(),
  operatingElectricitySharePercent: percentSchema.nullish(),
  vatMode: z.enum(['brutto', 'netto']).nullish(),
  deviationJustification: z.string().nullish(),
})
export type HeatingDefaults = z.infer<typeof heatingDefaultsSchema>

/**
 * Manuell gepflegte Gesamtnenner (Legacy `Abrechnung.gesamt`) für die
 * Leerstandsbehandlung: ist der Gesamtwert größer als die Summe der
 * erfassten Nutzerwerte, trägt der Vermieter die Differenz.
 */
export const billingTotalsSchema = z.strictObject({
  usableAreaSqm: quantitySchema.nullish(),
  heatedAreaSqm: quantitySchema.nullish(),
  persons: quantitySchema.nullish(),
  consumptionUnits: quantitySchema.nullish(),
  residentialUnitCount: quantitySchema.nullish(),
})
export type BillingTotals = z.infer<typeof billingTotalsSchema>

/** Freitexte für die PDF-Ausgabe (Legacy `Abrechnung.hinweise`). */
export const billingNotesSchema = z.strictObject({
  general: z.string().nullish(),
  credit: z.string().nullish(),
  additionalPayment: z.string().nullish(),
})
export type BillingNotes = z.infer<typeof billingNotesSchema>

/** Optionales Serienanschreiben (Legacy `Abrechnung.anschreiben`). */
export const coverLetterSchema = z.strictObject({
  active: z.boolean(),
  text: z.string().nullish(),
})
export type CoverLetter = z.infer<typeof coverLetterSchema>

/**
 * Status je Standardkostenart (Legacy `standardKostenartenStatus`):
 * Schlüssel = Standardkostenart-Key, Wert = Aktivierung + Begründung.
 */
export const standardCostCategoryStatusSchema = z.record(
  z.string(),
  z.strictObject({
    active: z.boolean(),
    reason: z.string().nullish(),
  }),
)
export type StandardCostCategoryStatus = z.infer<
  typeof standardCostCategoryStatusSchema
>

/** BillingPeriod / Abrechnungsjahr (Legacy: `Abrechnung`). */
export const billingPeriodSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  year: z.int().min(1900).max(2200),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  status: billingPeriodStatusSchema,
  /** Versanddatum, startet die Frist nach § 556 Abs. 3 BGB. */
  dispatchDate: isoDateSchema.nullish(),
  heatingDefaults: heatingDefaultsSchema.nullish(),
  totals: billingTotalsSchema.nullish(),
  standardCostCategoryStatus: standardCostCategoryStatusSchema.nullish(),
  notes: billingNotesSchema.nullish(),
  coverLetter: coverLetterSchema.nullish(),
  lastModifiedAt: isoTimestampSchema.nullish(),
})
export type BillingPeriod = z.infer<typeof billingPeriodSchema>
