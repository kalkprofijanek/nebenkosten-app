/**
 * Aktuelles Dateiformat (Schema-Version 4).
 *
 * Die Datei trennt Stammdaten und abrechnungsjahresbezogene Daten
 * in zwei getrennte Container. Jede Datei trägt eine
 * explizite `schemaVersion`; unbekannte neuere Versionen dürfen von der
 * Anwendung nicht überschrieben werden.
 *
 * Alle Objekte sind `strict`: unbekannte Felder führen zu einem
 * Validierungsfehler statt zu stillem Verlust. Vorwärtskompatibilität
 * wird über die `schemaVersion` und explizite Migrationen gelöst,
 * nicht über stilles Ignorieren.
 */
import { z } from 'zod'
import { isoTimestampSchema, sha256HexSchema } from '../../primitives'
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
  heatingSystemSchema,
  occupancyPeriodSchema,
  organizationSchema,
  ownerCompanySchema,
  personSchema,
  prepaymentSchema,
  propertySchema,
  tenancySchema,
  unitSchema,
} from '../../entities'

import { v4HeatingCircuitSchema } from './heating'
import {
  v4MeterBillingStatusSchema,
  v4MeterSchema,
  v4MeterReadingSchema,
} from './metering'

/** Stammdaten-Container (jahresunabhängig). */
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
  meters: z.array(v4MeterSchema),
})
export type MasterData = z.infer<typeof masterDataSchema>

/** Abrechnungsjahresbezogener Container. */
export const billingDataSchema = z.strictObject({
  billingPeriods: z.array(billingPeriodSchema),
  occupancyPeriods: z.array(occupancyPeriodSchema),
  prepayments: z.array(prepaymentSchema),
  costCategories: z.array(costCategorySchema),
  costEntries: z.array(costEntrySchema),
  bankBookings: z.array(bankBookingSchema),
  heatingCircuits: z.array(v4HeatingCircuitSchema),
  energySources: z.array(energySourceSchema),
  fuelStocks: z.array(fuelStockSchema),
  fuelDeliveries: z.array(fuelDeliverySchema),
  meterReadings: z.array(v4MeterReadingSchema),
  meterBillingStatuses: z.array(v4MeterBillingStatusSchema),
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
export const v4AppDataFileSchema = z.strictObject({
  schemaVersion: z.literal(4),
  meta: fileMetaSchema,
  masterData: masterDataSchema,
  billingData: billingDataSchema,
})
export type V4AppDataFile = z.infer<typeof v4AppDataFileSchema>
