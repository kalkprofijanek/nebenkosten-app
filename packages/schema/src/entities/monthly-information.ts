/**
 * Monatliche Verbrauchsinformation nach § 6a Abs. 1 Nr. 2 HeizKV
 * (ADR-0014, Schritt 3): Versandweg je Mietverhältnis und Versandprotokoll
 * je Objekt und Monat. Additiv, Schema v5.
 */
import { z } from 'zod'
import { entityIdSchema, isoDateSchema } from '../primitives'

export const monthlyInformationChannelSchema = z.enum(['email', 'letter'])
export type MonthlyInformationChannel = z.infer<
  typeof monthlyInformationChannelSchema
>

/**
 * Versandweg am Mietverhältnis. E-Mail nur mit dokumentierter Zustimmung
 * (Datum als Nachweis); ohne Angabe gilt Brief.
 */
export const monthlyInformationDeliverySchema = z
  .strictObject({
    channel: monthlyInformationChannelSchema,
    emailConsentDate: isoDateSchema.nullish(),
  })
  .refine((value) => value.channel !== 'email' || value.emailConsentDate, {
    message: 'Für den E-Mail-Versand ist das Datum der Zustimmung anzugeben.',
    path: ['emailConsentDate'],
  })
export type MonthlyInformationDelivery = z.infer<
  typeof monthlyInformationDeliverySchema
>

/** Kalendermonat im Format JJJJ-MM. */
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, 'Monat im Format JJJJ-MM erwartet.')

/**
 * Versandprotokoll eines Monats: ein Eintrag je Mietverhältnis mit Weg und
 * Status; nicht versandte Einträge begründen die Ausnahme.
 */
export const monthlyInformationDispatchSchema = z.strictObject({
  id: entityIdSchema,
  propertyId: entityIdSchema,
  month: yearMonthSchema,
  dispatchedOn: isoDateSchema,
  entries: z.array(
    z.strictObject({
      tenancyId: entityIdSchema,
      channel: monthlyInformationChannelSchema,
      status: z.enum(['sent', 'not_sent']),
      note: z.string().trim().min(1).nullish(),
    }),
  ),
})
export type MonthlyInformationDispatch = z.infer<
  typeof monthlyInformationDispatchSchema
>
