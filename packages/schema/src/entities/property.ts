/**
 * Liegenschaft, Gebäudeblock und Nutzungseinheit (Masterplan 5.1, 5.2).
 * Alles hier ist Stammdaten-Ebene (jahresunabhängig).
 */
import { z } from 'zod'
import { entityIdSchema, isoDateSchema, quantitySchema } from '../primitives'
import {
  addressSchema,
  bankAccountSchema,
  legacyUnmappedSchema,
} from './shared'

/**
 * Fernablesbarkeit der Erfassungsgeräte für Heizung und Warmwasser eines
 * Objekts (§ 5 Abs. 2 und 3, § 6a HeizKV; additiv, Schema v5, ADR-0014).
 * `since`: Datum, ab dem alle Wärme-/Warmwasserzähler und
 * Heizkostenverteiler fernablesbar sind. `exemptionReason`: begründete
 * Ausnahme nach § 5 Abs. 3 Satz 2 HeizKV (technisch unmöglich oder
 * unbillige Härte).
 */
export const remoteReadingSchema = z.strictObject({
  since: isoDateSchema.nullish(),
  exemptionReason: z.string().trim().min(1).nullish(),
})
export type RemoteReading = z.infer<typeof remoteReadingSchema>

/**
 * Property / Liegenschaft (Legacy: `Objekt`, Stammdaten-Anteil).
 * `legacySourceInfo` bewahrt den Legacy-Herkunftsvermerk `excel_quelle`
 * unverändert auf (reine Dokumentation, keine Rechenwirkung).
 */
export const propertySchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  ownerCompanyId: entityIdSchema,
  internalNumber: z.string().nullish(),
  externalNumber: z.string().nullish(),
  address: addressSchema.nullish(),
  bankAccount: bankAccountSchema.nullish(),
  remoteReading: remoteReadingSchema.nullish(),
  legacySourceInfo: z.record(z.string(), z.unknown()).nullish(),
})
export type Property = z.infer<typeof propertySchema>

/**
 * Building / Gebäude oder Abrechnungsblock (Legacy: `Block`, `B1`…`B9`).
 * `mandateRefPrefixes` steuert die automatische Zuordnung von
 * Nutzungseinheiten über die Mandatsreferenz (Legacy `blockVonRef`).
 */
export const buildingSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  name: z.string().min(1),
  shortName: z.string().nullish(),
  defaultEnergySourceType: z.string().nullish(),
  mandateRefPrefixes: z.array(z.string().min(1)),
})
export type Building = z.infer<typeof buildingSchema>

/**
 * Unit / Nutzungseinheit. Im Legacy-Format sind Einheitendaten Teil des
 * `Nutzer`-Objekts; die Migration extrahiert daraus je Nutzerzeile eine
 * Einheit. Flächen sind Mengen mit Einheit `m2` (Masterplan 5.3);
 * `null` = bewusst „nicht vorhanden“, fehlend = nicht erfasst.
 */
export const unitSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  buildingId: entityIdSchema.nullish(),
  label: z.string().nullish(),
  location: z.string().nullish(),
  usableAreaSqm: quantitySchema.nullish(),
  heatedAreaSqm: quantitySchema.nullish(),
  roomCount: z.number().finite().nonnegative().nullish(),
})
export type Unit = z.infer<typeof unitSchema>
