import { z } from 'zod'
import { legacyUnmappedSchema } from '../../entities/shared'
import {
  entityIdSchema,
  isoDateSchema,
  moneyCentsSchema,
  quantitySchema,
} from '../../primitives'

export const v4MeterKindSchema = z.enum(['general', 'heat'])
export const v4MeterSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  propertyId: entityIdSchema,
  kind: v4MeterKindSchema,
  address: z.string().nullish(),
  meterNumber: z.string().nullish(),
  maloId: z.string().nullish(),
  provider: z.string().nullish(),
  contractOrAccountNumber: z.string().nullish(),
  energySourceRef: z
    .strictObject({
      heatingCircuitBuildingId: entityIdSchema,
      energySourceKey: z.string().min(1),
    })
    .nullish(),
  validFrom: isoDateSchema.nullish(),
  validTo: isoDateSchema.nullish(),
  meterNumberStatus: z.enum(['open', 'confirmed']).nullish(),
  note: z.string().nullish(),
  additionalNote: z.string().nullish(),
})
export const v4MeterReadingSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  meterId: entityIdSchema,
  billingPeriodId: entityIdSchema.nullish(),
  date: isoDateSchema.nullish(),
  value: quantitySchema,
  source: z.enum(['manual', 'imported', 'estimated']).nullish(),
  note: z.string().nullish(),
})
export const v4MeterBillingStatusSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  meterId: entityIdSchema,
  billingPeriodId: entityIdSchema.nullish(),
  year: z.int().min(1900).max(2200),
  bookingPresent: z.boolean().nullish(),
  annualInvoicePresent: z.boolean().nullish(),
  note: z.string().nullish(),
  estimateAmountCents: moneyCentsSchema.nullish(),
  estimateReason: z.string().nullish(),
})
