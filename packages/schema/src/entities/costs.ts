/**
 * Kostenarten, Kostenbuchungen/Belege und Umlageregeln (Masterplan 5.1).
 * Alle Entitäten hier sind abrechnungsjahresbezogen (Masterplan 5.2);
 * dauerhafte Umlageschlüssel werden über `AllocationRule` als Stammdaten
 * geführt.
 */
import { z } from 'zod'
import {
  entityIdSchema,
  isoDateSchema,
  moneyCentsSchema,
  percentSchema,
} from '../primitives'
import {
  allocationScopeSchema,
  bookingLinkSchema,
  estimateSchema,
  externalPaymentSchema,
  fileAttachmentSchema,
  legacyUnmappedSchema,
} from './shared'

/**
 * Umlageschlüssel (Legacy `UMLAGE_OPT`):
 * `usable_area` = m² Nutzfläche (`m2_nf`),
 * `heated_area` = m² beheizte Fläche (`m2_nf_hzg`),
 * `consumption_units` = HKV-Verbrauchseinheiten (`einheiten`),
 * `residential_units` = je Wohneinheit (`we_anzahl`),
 * `direct` = direkte Zuordnung ohne automatische Verteilung (`direkt`).
 */
export const allocationKeySchema = z.enum([
  'usable_area',
  'heated_area',
  'consumption_units',
  'residential_units',
  'direct',
])
export type AllocationKey = z.infer<typeof allocationKeySchema>

/**
 * AllocationRule / dauerhafte Umlageregel (Stammdaten). Im Legacy-Format
 * existiert nur das Feld `umlage_nach` je Kostenart; die Regel-Entität
 * erlaubt später mandantenweite Standard-Schlüssel je Kostenart-Typ.
 */
export const allocationRuleSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  organizationId: entityIdSchema,
  name: z.string().min(1),
  key: allocationKeySchema,
  description: z.string().nullish(),
})
export type AllocationRule = z.infer<typeof allocationRuleSchema>

/** Kostenart-Typ (Legacy `typ`): steuert die Umlagelogik grundlegend. */
export const costCategoryKindSchema = z.enum(['operating', 'water', 'heating'])
export type CostCategoryKind = z.infer<typeof costCategoryKindSchema>

/**
 * CostCategory / Kostenart eines Abrechnungsjahres (Legacy: `Kostenart`
 * ohne die Beleg-Beträge — Beträge leben in `CostEntry`).
 */
export const costCategorySchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  /** Referenz auf den Standardkostenarten-Katalog (Legacy `standard_key`). */
  standardKey: z.string().nullish(),
  kind: costCategoryKindSchema,
  /** Interner Name (Legacy `bezeichnung`). */
  label: z.string().min(1),
  /** Text auf der Abrechnung (Legacy `kostentext`). */
  statementText: z.string().nullish(),
  /** BetrKV-Kategorie (Legacy `betrKV_kat`, inkl. `NICHT_UML`). */
  betrkvCategory: z.string().nullish(),
  /** Umlageschlüssel; bei `kind: 'heating'` fachlich wirkungslos (Heiztopf). */
  allocationKey: allocationKeySchema.nullish(),
  /** Geltungsbereich (Legacy `scope_key`; leer = ganzes Objekt). */
  scope: allocationScopeSchema.nullish(),
  /** Gesamtbetrag in Cent (Legacy `betrag`, dort Fließkomma-Euro). */
  totalAmountCents: moneyCentsSchema.nullish(),
  /** Rechnungsdatum der Kostenart (Legacy `datum`). */
  date: isoDateSchema.nullish(),
  /** Quelle der Betriebsstrom-Reallokation (Legacy `betriebsstrom_abzug`). */
  isOperatingElectricitySource: z.boolean().nullish(),
  /** Bei Betrag 0 aus der Abrechnung ausblenden (Legacy). */
  hideWhenZero: z.boolean().nullish(),
  /** Kostenart-weiter Umlagegrad-Fallback (Legacy `umlage_proz`). */
  allocablePercent: percentSchema.nullish(),
  /** § 35a EStG Lohnanteil (Legacy `lohn_anteil_proz`). */
  laborSharePercent: percentSchema.nullish(),
  /** Herkunftsmarker Grundsteuer-Import (Legacy-Felder). */
  fromPropertyTaxImport: z.boolean().nullish(),
  propertyTaxAssessmentCents: moneyCentsSchema.nullish(),
})
export type CostCategory = z.infer<typeof costCategorySchema>

/**
 * CostEntry / Kostenbuchung oder Rechnung (Legacy: `Beleg`/`rechnungen[]`
 * einer Kostenart). Beträge in ganzen Cent.
 */
export const costEntrySchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  costCategoryId: entityIdSchema,
  date: isoDateSchema.nullish(),
  description: z.string().nullish(),
  amountCents: moneyCentsSchema,
  /** Belegnummer/Dateiname, Freitext (Legacy `beleg`). */
  receiptReference: z.string().nullish(),
  attachment: fileAttachmentSchema.nullish(),
  /** Beleg-individueller Umlagegrad, überstimmt die Kostenart (Legacy). */
  allocablePercent: percentSchema.nullish(),
  bookingLink: bookingLinkSchema.nullish(),
  externalPayment: externalPaymentSchema.nullish(),
  /** Zuordnung zu einem Zähler (Legacy `_stromzaehler_id`). */
  meterId: entityIdSchema.nullish(),
  estimate: estimateSchema.nullish(),
})
export type CostEntry = z.infer<typeof costEntrySchema>
