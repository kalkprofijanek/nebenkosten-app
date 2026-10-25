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
  nonNegativeMoneyCentsSchema,
  percentSchema,
} from '../primitives'
import {
  allocationScopeSchema,
  amountBasisSchema,
  costOriginSchema,
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
 * `water_consumption` = gemessener Wasserverbrauch, Kalt- plus Warmwasser in
 *   m³ je Nutzung (§ 556a Abs. 1 Satz 2 BGB; additiv, Schema v5, ADR-0013),
 * `direct` = direkte Zuordnung ohne automatische Verteilung (`direkt`).
 */
export const allocationKeySchema = z.enum([
  'usable_area',
  'heated_area',
  'consumption_units',
  'residential_units',
  'water_consumption',
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
 * Art des Entgelts für Verbrauchserfassung und Abrechnung (§ 6a Abs. 3
 * Nr. 1c HeizKV, ADR-0015). Trennt die Erstellung der Heiz-/Warmwasser-
 * kostenabrechnung (`billing_service`) von Ablesung, Gerätemiete und Eichung,
 * damit Doppelansätze erkannt werden. Leer = nicht unterschieden.
 */
export const meteringFeeKindSchema = z.enum([
  'billing_service',
  'reading',
  'device_rental',
  'calibration',
  'other',
])
export type MeteringFeeKind = z.infer<typeof meteringFeeKindSchema>

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
  /**
   * Entgelt für Verbrauchserfassung und Abrechnung (§ 6a Abs. 3 Nr. 1c
   * HeizKV). Leer = Erkennung über Schlagworte (additiv, Schema v5;
   * ADR-0006).
   */
  meteringFee: z.boolean().nullish(),
  /** Art des Entgelts (additiv, Schema v5; ADR-0015). */
  meteringFeeKind: meteringFeeKindSchema.nullish(),
  /** Herkunftsmarker Grundsteuer-Import (Legacy-Felder). */
  fromPropertyTaxImport: z.boolean().nullish(),
  propertyTaxAssessmentCents: moneyCentsSchema.nullish(),
})
export type CostCategory = z.infer<typeof costCategorySchema>

/**
 * Rechnungsangaben eines Belegs (additiv, Schema v5; ADR-0015). Der
 * Belegbetrag `amountCents` bleibt der umgelegte Betrag (bei Wohnraum ohne
 * Vorsteuerabzug brutto); Netto und Umsatzsteuer sind Angaben der Rechnung,
 * die die Prüfung gegen den Belegbetrag abgleicht. Der Leistungszeitraum ist
 * der tatsächliche Zeitraum der Leistung (z. B. Erstellung der Abrechnung im
 * Folgejahr), nicht der abgerechnete Zeitraum.
 */
export const costEntryInvoiceSchema = z
  .strictObject({
    invoiceNumber: z.string().trim().min(1).max(200).nullish(),
    invoiceDate: isoDateSchema.nullish(),
    servicePeriodStart: isoDateSchema.nullish(),
    servicePeriodEnd: isoDateSchema.nullish(),
    netCents: nonNegativeMoneyCentsSchema.nullish(),
    vatCents: nonNegativeMoneyCentsSchema.nullish(),
    vatRatePercent: percentSchema.nullish(),
  })
  .refine(
    (value) =>
      !value.servicePeriodStart ||
      !value.servicePeriodEnd ||
      value.servicePeriodStart <= value.servicePeriodEnd,
    {
      message: 'Der Leistungszeitraum muss vor seinem Ende beginnen.',
      path: ['servicePeriodEnd'],
    },
  )
export type CostEntryInvoice = z.infer<typeof costEntryInvoiceSchema>

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
  /** Herkunft bei Eigentümerwechsel (additiv, Schema v5, PR-30). */
  origin: costOriginSchema.nullish(),
  /** Rechnung, Abschläge oder Schätzung (additiv, Schema v5, PR-30). */
  amountBasis: amountBasisSchema.nullish(),
  /** Rechnungsangaben (additiv, Schema v5; ADR-0015). */
  invoice: costEntryInvoiceSchema.nullish(),
})
export type CostEntry = z.infer<typeof costEntrySchema>
