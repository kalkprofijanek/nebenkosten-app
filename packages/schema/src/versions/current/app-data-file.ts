/**
 * Aktuelles Dateiformat (Schema-Version 4).
 *
 * Die Datei trennt Stammdaten und abrechnungsjahresbezogene Daten
 * (Masterplan 5.2) in zwei getrennte Container. Jede Datei trägt eine
 * explizite `schemaVersion`; unbekannte neuere Versionen dürfen von der
 * Anwendung nicht überschrieben werden (Masterplan 5.3).
 *
 * Alle Objekte sind `strict`: unbekannte Felder führen zu einem
 * Validierungsfehler statt zu stillem Verlust. Vorwärtskompatibilität
 * wird über die `schemaVersion` und explizite Migrationen gelöst,
 * nicht über stilles Ignorieren.
 */
import { z } from 'zod'
import {
  CURRENT_SCHEMA_VERSION,
  isoTimestampSchema,
  sha256HexSchema,
} from '../../primitives'
import {
  allocationRuleSchema,
  auditEventSchema,
  bankBookingSchema,
  billingPeriodSchema,
  buildingSchema,
  calculationResultSchema,
  calculationRunSchema,
  costCategorySchema,
  costEntrySchema,
  documentSchema,
  energySourceSchema,
  fuelDeliverySchema,
  fuelStockSchema,
  heatingCircuitSchema,
  heatingSystemSchema,
  meterBillingStatusSchema,
  meterReadingSchema,
  meterSchema,
  occupancyPeriodSchema,
  organizationSchema,
  ownerCompanySchema,
  personSchema,
  prepaymentSchema,
  propertySchema,
  tenancySchema,
  unitSchema,
} from '../../entities'

/** Stammdaten-Container (jahresunabhängig, Masterplan 5.2). */
export const masterDataSchema = z.strictObject({
  organizations: z.array(organizationSchema),
  ownerCompanies: z.array(ownerCompanySchema),
  properties: z.array(propertySchema),
  buildings: z.array(buildingSchema),
  units: z.array(unitSchema),
  persons: z.array(personSchema),
  tenancies: z.array(tenancySchema),
  allocationRules: z.array(allocationRuleSchema),
  heatingSystems: z.array(heatingSystemSchema),
  meters: z.array(meterSchema),
})
export type MasterData = z.infer<typeof masterDataSchema>

/** Abrechnungsjahresbezogener Container (Masterplan 5.2). */
export const billingDataSchema = z.strictObject({
  billingPeriods: z.array(billingPeriodSchema),
  occupancyPeriods: z.array(occupancyPeriodSchema),
  prepayments: z.array(prepaymentSchema),
  costCategories: z.array(costCategorySchema),
  costEntries: z.array(costEntrySchema),
  bankBookings: z.array(bankBookingSchema),
  heatingCircuits: z.array(heatingCircuitSchema),
  energySources: z.array(energySourceSchema),
  fuelStocks: z.array(fuelStockSchema),
  fuelDeliveries: z.array(fuelDeliverySchema),
  meterReadings: z.array(meterReadingSchema),
  meterBillingStatuses: z.array(meterBillingStatusSchema),
  calculationRuns: z.array(calculationRunSchema),
  calculationResults: z.array(calculationResultSchema),
  documents: z.array(documentSchema),
  auditEvents: z.array(auditEventSchema),
})
export type BillingData = z.infer<typeof billingDataSchema>

/** Technische Metadaten der Datei. */
export const fileMetaSchema = z.strictObject({
  /** Zeitpunkt der letzten Speicherung (Legacy `gespeichert`). */
  savedAt: isoTimestampSchema.nullish(),
  /** App-Version, die die Datei geschrieben hat. */
  appVersion: z.string().nullish(),
  /** Herkunft bei migrierten Dateien (siehe MigrationReport). */
  migratedFrom: z
    .strictObject({
      schemaVersion: z.int().positive(),
      sourceSha256: sha256HexSchema,
      migratedAt: isoTimestampSchema,
    })
    .nullish(),
})
export type FileMeta = z.infer<typeof fileMetaSchema>

/** Wurzelstruktur des aktuellen Dateiformats. */
export const appDataFileSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: fileMetaSchema,
  masterData: masterDataSchema,
  billingData: billingDataSchema,
})
export type AppDataFile = z.infer<typeof appDataFileSchema>

/** Leere, gültige Datei (Hilfsfunktion für Tests und neue Bestände). */
export function createEmptyAppDataFile(): AppDataFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {},
    masterData: {
      organizations: [],
      ownerCompanies: [],
      properties: [],
      buildings: [],
      units: [],
      persons: [],
      tenancies: [],
      allocationRules: [],
      heatingSystems: [],
      meters: [],
    },
    billingData: {
      billingPeriods: [],
      occupancyPeriods: [],
      prepayments: [],
      costCategories: [],
      costEntries: [],
      bankBookings: [],
      heatingCircuits: [],
      energySources: [],
      fuelStocks: [],
      fuelDeliveries: [],
      meterReadings: [],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  }
}
