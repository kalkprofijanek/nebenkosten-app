/**
 * Heizsystem, Heizkreis, Energiequelle, Brennstoffbestand und Lieferung
 * (Masterplan 5.1). HeatingSystem/HeatingCircuit/EnergySource sind
 * Stammdaten-nah, FuelStock und FuelDelivery abrechnungsjahresbezogen.
 */
import { z } from 'zod'
import {
  entityIdSchema,
  isoDateSchema,
  moneyCentsSchema,
  percentSchema,
  quantitySchema,
} from '../primitives'
import {
  bookingLinkSchema,
  externalPaymentSchema,
  legacyUnmappedSchema,
} from './shared'

/**
 * HeatingSystem / Heizsystem einer Liegenschaft. Im Legacy-Format nur
 * implizit vorhanden (Objekt = genau eine Anlage mit mehreren
 * Heizkreis-Blöcken); die Migration erzeugt genau ein HeatingSystem
 * je Liegenschaft.
 */
export const heatingSystemSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  name: z.string().nullish(),
})
export type HeatingSystem = z.infer<typeof heatingSystemSchema>

/**
 * CO₂-Parameter eines Heizkreises (Legacy `Heizkreis.co2`).
 * `manual` überschreibt die automatische Berechnung vollständig.
 */
export const co2ConfigSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('auto'),
    co2FactorKgPerKwh: z.number().finite().nonnegative().nullish(),
    co2PricePerTonCents: moneyCentsSchema.nullish(),
  }),
  z.strictObject({
    mode: z.literal('manual'),
    co2FactorKgPerKwh: z.number().finite().nonnegative().nullish(),
    co2PricePerTonCents: moneyCentsSchema.nullish(),
    /** Manuell gesetzte CO₂-Abgabe in Cent (Legacy `abgabe`, Euro). */
    levyCents: moneyCentsSchema.nullish(),
    landlordSharePercent: percentSchema.nullish(),
    /** Manuell gesetzter Kennwert kg CO₂/m²·a (Legacy `kennwert_kg_m2a`). */
    intensityKgPerSqmYear: z.number().finite().nonnegative().nullish(),
  }),
])
export type Co2Config = z.infer<typeof co2ConfigSchema>

/** Heizkreis-eigene Vorgaben (Legacy `Heizkreis.vorgaben`). */
export const heatingCircuitOverridesSchema = z.strictObject({
  consumptionSharePercent: percentSchema.nullish(),
  baseSharePercent: percentSchema.nullish(),
  operatingElectricitySharePercent: percentSchema.nullish(),
})
export type HeatingCircuitOverrides = z.infer<
  typeof heatingCircuitOverridesSchema
>

/**
 * Vergleichswerte für den normierten Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4
 * HeizKV), z. B. aus dem Heizspiegel für Deutschland (co2online). Erfasst
 * werden die Klassengrenzen in kWh je m² Wohnfläche und Jahr, wie sie die
 * Quelle für Energieträger und Gebäudekategorie ausweist („niedrig“ bis
 * `lowMax`, „mittel“ bis `mediumMax`, „erhöht“ bis `elevatedMax`, darüber
 * „zu hoch“). Die Werte werden nicht von der App vorgegeben, sondern aus der
 * Quelle übernommen (ADR-0004).
 */
export const consumptionBenchmarkSchema = z
  .strictObject({
    /** Bezeichnung der Quelle, z. B. „Heizspiegel für Deutschland (co2online)“. */
    source: z.string().trim().min(1),
    /** Fundstelle der Werte (Flyer, Webseite). */
    sourceUrl: z.url({ protocol: /^https?$/u }).nullish(),
    /** Abrechnungsjahr, auf das sich die Vergleichswerte beziehen. */
    referenceYear: z.int().min(1990).max(2100),
    /** Nutzerkategorie laut Quelle, z. B. „Erdgas, Baujahr 1978–1983“. */
    category: z.string().trim().min(1),
    /** Die Werte enthalten die Energie für die Warmwasserbereitung. */
    includesHotWater: z.boolean(),
    lowMaxKwhPerSqmYear: z.number().finite().positive(),
    mediumMaxKwhPerSqmYear: z.number().finite().positive(),
    elevatedMaxKwhPerSqmYear: z.number().finite().positive(),
  })
  .refine(
    (value) =>
      value.lowMaxKwhPerSqmYear < value.mediumMaxKwhPerSqmYear &&
      value.mediumMaxKwhPerSqmYear < value.elevatedMaxKwhPerSqmYear,
    {
      message:
        'Die Klassengrenzen müssen aufsteigend sein (niedrig < mittel < erhöht).',
      path: ['mediumMaxKwhPerSqmYear'],
    },
  )
export type ConsumptionBenchmark = z.infer<typeof consumptionBenchmarkSchema>

/**
 * HeatingCircuit / Heizkreis eines Abrechnungsjahres (Legacy:
 * `Abrechnung.heizkreise[]`, 1:1 zum Gebäudeblock).
 */
export const heatingCircuitSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  heatingSystemId: entityIdSchema,
  /** Zugehöriger Gebäudeblock (Legacy: `Heizkreis.id === Block.id`). */
  buildingId: entityIdSchema,
  consumptionMode: z.enum(['manual', 'metered_kwh']).nullish(),
  meterAssignments: z
    .array(
      z.strictObject({
        meterId: entityIdSchema,
        unitId: entityIdSchema,
      }),
    )
    .nullish(),
  co2: co2ConfigSchema.nullish(),
  overrides: heatingCircuitOverridesSchema.nullish(),
  /** Zentrale Warmwasserbereitung nach § 9 HeizKV aktiv. */
  hasCentralHotWater: z.boolean(),
  /** Warmwasser-Anteil an den Brennstoffkosten (18–70 %). */
  hotWaterSharePercent: percentSchema.nullish(),
  /** Vergleichswerte nach § 6a Abs. 3 Nr. 4 HeizKV (additiv, Schema v5). */
  consumptionBenchmark: consumptionBenchmarkSchema.nullish(),
})
export type HeatingCircuit = z.infer<typeof heatingCircuitSchema>

/**
 * EnergySource / Energiequelle eines Heizkreises (Legacy:
 * `Heizkreis.energiequellen[]` bzw. das ältere Einzel-`brennstoff`).
 * `key` folgt der Legacy-Konvention (`haupt`, `wp_strom`, `gas`, …).
 */
export const energySourceSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  heatingCircuitId: entityIdSchema,
  key: z.string().min(1),
  name: z.string().nullish(),
  /** Energieträger, Freitext (Legacy `art`). */
  sourceType: z.string().nullish(),
  /** Heizwert kWh je Mengeneinheit (Legacy `heizwert_kwh`). */
  calorificValueKwhPerUnit: z.number().finite().nonnegative().nullish(),
  co2FactorKgPerKwh: z.number().finite().nonnegative().nullish(),
})
export type EnergySource = z.infer<typeof energySourceSchema>

/**
 * FuelStock / Brennstoffbestand einer Energiequelle im Abrechnungsjahr
 * (Legacy: `anfangsbestand_*` und `restbestand_menge`).
 * `null` = bewusst „kein Bestand“, fehlend = nicht erfasst — für die
 * FIFO-Bewertung ist dieser Unterschied fachlich relevant.
 */
export const fuelStockSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  energySourceId: entityIdSchema,
  billingPeriodId: entityIdSchema,
  openingQuantity: quantitySchema.nullish(),
  openingValueCents: moneyCentsSchema.nullish(),
  /** Preis je Mengeneinheit in Cent (Legacy `anfangsbestand_preis`). */
  openingPricePerUnitCents: moneyCentsSchema.nullish(),
  remainingQuantity: quantitySchema.nullish(),
})
export type FuelStock = z.infer<typeof fuelStockSchema>

/**
 * Herkunfts-/Vertrauensmarker der Liefermenge (Legacy `mengenstatus`).
 * Freie Legacy-Strings werden bei der Migration unverändert übernommen.
 */
export const fuelDeliveryQuantityStatusSchema = z.string()

/**
 * FuelDelivery / Brennstofflieferung (Legacy: `lieferungen[]`).
 */
export const fuelDeliverySchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  energySourceId: entityIdSchema,
  billingPeriodId: entityIdSchema,
  date: isoDateSchema.nullish(),
  quantity: quantitySchema.nullish(),
  quantityStatus: fuelDeliveryQuantityStatusSchema.nullish(),
  quantityNote: z.string().nullish(),
  quantityManuallySet: z.boolean().nullish(),
  amountCents: moneyCentsSchema.nullish(),
  description: z.string().nullish(),
  receiptReference: z.string().nullish(),
  bookingLink: bookingLinkSchema.nullish(),
  externalPayment: externalPaymentSchema.nullish(),
  meterId: entityIdSchema.nullish(),
  /** Herkunftsmarker: aus Kostenart-Beleg konvertiert (Legacy). */
  convertedFromCostCategoryId: entityIdSchema.nullish(),
})
export type FuelDelivery = z.infer<typeof fuelDeliverySchema>
