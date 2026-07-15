/**
 * Mietverhältnis, Nutzungszeitraum und Vorauszahlung (Masterplan 5.1).
 * Tenancy ist Stammdaten-nah, OccupancyPeriod und Prepayment sind
 * abrechnungsjahresbezogen (Masterplan 5.2).
 */
import { z } from 'zod'
import {
  entityIdSchema,
  isoDateSchema,
  moneyCentsSchema,
  quantitySchema,
} from '../primitives'
import { allocationScopeSchema, legacyUnmappedSchema } from './shared'

/**
 * Tenancy / Mietverhältnis (Legacy: Vertrags-Anteil des `Nutzer`-Objekts).
 * `mandateReference` ist der zentrale Legacy-Schlüssel für die
 * Block-/Haus-Zuordnung (Konvention `<Präfix>_<Nr|leerstand>`).
 * `monthlyRentCents` wird erfasst, aber nicht in der NK-Berechnung
 * verwendet (Legacy-Verhalten, dort `miete_monat`).
 */
export const tenancySchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  unitId: entityIdSchema,
  personIds: z.array(entityIdSchema),
  mandateReference: z.string().nullish(),
  movedIn: isoDateSchema.nullish(),
  movedOut: isoDateSchema.nullish(),
  monthlyRentCents: moneyCentsSchema.nullish(),
  shippingAddressStreet: z.string().nullish(),
  shippingAddressPostalCodeAndCity: z.string().nullish(),
})
export type Tenancy = z.infer<typeof tenancySchema>

/**
 * OccupancyPeriod / Nutzungszeitraum innerhalb eines Abrechnungsjahres.
 * `kind: 'vacancy'` ersetzt die drei Legacy-Leerstandskriterien
 * (`leerstand`, `aktiv` enthält „Leerstand“, Mandatsref enthält
 * „leerstand“) durch genau ein explizites Merkmal.
 */
export const occupancyPeriodSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  unitId: entityIdSchema,
  /** `null` bei Leerstand (kein Mietverhältnis). */
  tenancyId: entityIdSchema.nullish(),
  kind: z.enum(['tenant', 'vacancy']),
  /**
   * Legacy-Anzeige-Ampel `aktiv` (`'J'`/`'N'`/`'Leerstand'`) — ohne
   * Rechenwirkung, wird zur Verlustfreiheit unverändert mitgeführt;
   * die Leerstands-Information ist zusätzlich in `kind` normalisiert.
   */
  legacyActiveFlag: z.string().nullish(),
  /** Anzeige-/Sortierreihenfolge (Legacy `nr`). */
  displayOrder: z.int().nonnegative().nullish(),
  /** Leer = ganzer Abrechnungszeitraum (Legacy: eingezogen/ausgezogen). */
  from: isoDateSchema.nullish(),
  to: isoDateSchema.nullish(),
  /** Personenzahl für Personenschlüssel und Warmwasser (Einheit `personen`). */
  persons: quantitySchema.nullish(),
  /** HKV-Verbrauchseinheiten der Periode (Einheit `einheiten`). */
  consumptionUnits: quantitySchema.nullish(),
  consumptionUnitsEstimated: z.boolean().nullish(),
  consumptionUnitsEstimateReason: z.string().nullish(),
  /** §12 HeizKV: 15-%-Kürzung in der Berechnung anwenden. */
  applySection12Reduction: z.boolean().nullish(),
  /** Manuelle Bereichszuordnung, überschreibt Mandatsref-Ableitung. */
  costScope: allocationScopeSchema.nullish(),
  propertyTaxScope: allocationScopeSchema.nullish(),
  /** Ablesewerte für die Wassertabelle (Einheit `m3`). */
  coldWater: quantitySchema.nullish(),
  warmWater: quantitySchema.nullish(),
  /** Mieter-individuelles Versanddatum (überschreibt BillingPeriod). */
  dispatchDate: isoDateSchema.nullish(),
  note: z.string().nullish(),
})
export type OccupancyPeriod = z.infer<typeof occupancyPeriodSchema>

/**
 * Prepayment / Vorauszahlung (Legacy: `vz_monat`, `vz_gesamt`,
 * `keine_vz_vereinbart` auf dem Nutzer). Genau eine der drei Varianten:
 * monatlicher Betrag, Jahresbetrag oder „keine VZ vereinbart“
 * (§ 556 Abs. 2 BGB).
 */
export const prepaymentSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    id: entityIdSchema,
    occupancyPeriodId: entityIdSchema,
    mode: z.literal('monthly'),
    monthlyAmountCents: moneyCentsSchema,
    legacyUnmapped: legacyUnmappedSchema.nullish(),
  }),
  z.strictObject({
    id: entityIdSchema,
    occupancyPeriodId: entityIdSchema,
    mode: z.literal('annual'),
    annualAmountCents: moneyCentsSchema,
    legacyUnmapped: legacyUnmappedSchema.nullish(),
  }),
  z.strictObject({
    id: entityIdSchema,
    occupancyPeriodId: entityIdSchema,
    mode: z.literal('none_agreed'),
    legacyUnmapped: legacyUnmappedSchema.nullish(),
  }),
])
export type Prepayment = z.infer<typeof prepaymentSchema>
