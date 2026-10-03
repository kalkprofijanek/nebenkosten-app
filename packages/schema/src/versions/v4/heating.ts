import { z } from 'zod'
import {
  entityIdSchema,
  moneyCentsSchema,
  percentSchema,
} from '../../primitives'
import { legacyUnmappedSchema } from '../../entities/shared'

const co2ConfigSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('auto'),
    co2FactorKgPerKwh: z.number().finite().nonnegative().nullish(),
    co2PricePerTonCents: moneyCentsSchema.nullish(),
  }),
  z.strictObject({
    mode: z.literal('manual'),
    co2FactorKgPerKwh: z.number().finite().nonnegative().nullish(),
    co2PricePerTonCents: moneyCentsSchema.nullish(),
    levyCents: moneyCentsSchema.nullish(),
    landlordSharePercent: percentSchema.nullish(),
    intensityKgPerSqmYear: z.number().finite().nonnegative().nullish(),
  }),
])
const overridesSchema = z.strictObject({
  consumptionSharePercent: percentSchema.nullish(),
  baseSharePercent: percentSchema.nullish(),
  operatingElectricitySharePercent: percentSchema.nullish(),
})
export const v4HeatingCircuitSchema = z.strictObject({
  legacyUnmapped: legacyUnmappedSchema.nullish(),
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  heatingSystemId: entityIdSchema,
  buildingId: entityIdSchema,
  co2: co2ConfigSchema.nullish(),
  overrides: overridesSchema.nullish(),
  hasCentralHotWater: z.boolean(),
  hotWaterSharePercent: percentSchema.nullish(),
})
