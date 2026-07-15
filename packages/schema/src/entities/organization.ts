/**
 * Mandant, Eigentümergesellschaft und Vertragspartner (Masterplan 5.1).
 */
import { z } from 'zod'
import { entityIdSchema, isoTimestampSchema } from '../primitives'
import {
  addressSchema,
  bankAccountSchema,
  contactPersonSchema,
  salutationSchema,
} from './shared'

/**
 * Organization / Mandant. Im Legacy-Format existiert kein Mandantenbegriff
 * (eine Datei = ein impliziter Mandant); die Migration erzeugt genau eine
 * Organization je importierter Datei.
 */
export const organizationSchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1),
  createdAt: isoTimestampSchema.nullish(),
})
export type Organization = z.infer<typeof organizationSchema>

/**
 * OwnerCompany / Eigentümergesellschaft (Legacy: `Firma`).
 * `name` entspricht Legacy `name1` (faktisches Pflichtfeld der
 * Rechtsprüfung); `additionalNameLines` nimmt `name2..name4` auf.
 */
export const ownerCompanySchema = z.strictObject({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  name: z.string().min(1),
  additionalNameLines: z.array(z.string()).max(3),
  address: addressSchema.nullish(),
  postBox: z.string().nullish(),
  contact: contactPersonSchema.nullish(),
  bankAccount: bankAccountSchema.nullish(),
})
export type OwnerCompany = z.infer<typeof ownerCompanySchema>

/**
 * Person / Vertragspartner. Im Legacy-Format sind Personendaten Teil des
 * `Nutzer`-Objekts; die Migration extrahiert daraus je Nutzerzeile eine
 * Person. `displayName` entspricht dem Legacy-Freitextfeld `name`
 * (alternative Anzeige zu Vor-/Nachname, Legacy `nutzerName()`).
 */
export const personSchema = z.strictObject({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  salutation: salutationSchema.nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  displayName: z.string().nullish(),
  companyOrPrivate: z.string().nullish(),
  email: z.string().nullish(),
  note: z.string().nullish(),
})
export type Person = z.infer<typeof personSchema>
