import type {
  AppDataFile,
  AuditEvent,
  BillingPeriod,
  CostCategory,
  OccupancyPeriod,
  OwnerCompany,
  Person,
  Property,
  Tenancy,
  Unit,
} from '@nebenkosten/schema'
import type { CalculationOutput } from '@nebenkosten/core'

/** Wird geworfen, wenn ein Mietverhältnis keine Versandadresse hat. */
export class MissingShippingAddressError extends Error {
  constructor(readonly tenancyId: string) {
    super(
      `Mietverhältnis "${tenancyId}" hat keine Versandadresse (shippingAddressStreet/shippingAddressPostalCodeAndCity).`,
    )
    this.name = 'MissingShippingAddressError'
  }
}

export interface SenderBlock {
  readonly nameLines: readonly string[]
  readonly street: string | null
  readonly postalCodeAndCity: string | null
  readonly iban: string | null
  readonly bic: string | null
}

export interface RecipientBlock {
  readonly salutationLine: string
  readonly nameLines: readonly string[]
  readonly street: string
  readonly postalCodeAndCity: string
}

/** Gemeinsamer Kontext für die Einzelabrechnung eines Mieters. */
export interface TenantStatementContext {
  readonly appData: AppDataFile
  readonly billingPeriod: BillingPeriod
  readonly calculation: CalculationOutput
  readonly occupancyPeriod: OccupancyPeriod
  readonly tenancy: Tenancy
  readonly unit: Unit
  readonly property: Property
  readonly ownerCompany: OwnerCompany
  readonly persons: readonly Person[]
  readonly costCategories: readonly CostCategory[]
  readonly generatedAt: Date
}

/** Gemeinsamer Kontext für die objektweite Gesamtabrechnung/Kostenaufstellung. */
export interface CombinedCostStatementContext {
  readonly appData: AppDataFile
  readonly billingPeriod: BillingPeriod
  readonly calculation: CalculationOutput
  readonly property: Property
  readonly ownerCompany: OwnerCompany
  readonly costCategories: readonly CostCategory[]
  readonly occupancyPeriods: readonly OccupancyPeriod[]
  readonly tenancies: readonly Tenancy[]
  readonly units: readonly Unit[]
  readonly generatedAt: Date
}

export interface ApprovalLogContext {
  readonly billingPeriodId: string
  readonly auditEvents: readonly AuditEvent[]
  readonly generatedAt: Date
}
