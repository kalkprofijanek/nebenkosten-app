import type {
  AllocationRule,
  AuditEvent,
  BankBooking,
  BillingPeriod,
  Building,
  CostCategory,
  CostEntry,
  EnergySource,
  FuelDelivery,
  FuelStock,
  HeatingCircuit,
  HeatingSystem,
  Meter,
  MeterBillingStatus,
  OccupancyPeriod,
  Organization,
  OwnerCompany,
  Person,
  Prepayment,
  Property,
  Tenancy,
  Unit,
} from '../../entities'
import type { AppDataFile } from '../../versions/current'

export interface MigrationState {
  organizations: Organization[]
  ownerCompanies: OwnerCompany[]
  properties: Property[]
  buildings: Building[]
  units: Unit[]
  persons: Person[]
  tenancies: Tenancy[]
  allocationRules: AllocationRule[]
  heatingSystems: HeatingSystem[]
  meters: Meter[]
  billingPeriods: BillingPeriod[]
  occupancyPeriods: OccupancyPeriod[]
  prepayments: Prepayment[]
  costCategories: CostCategory[]
  costEntries: CostEntry[]
  bankBookings: BankBooking[]
  heatingCircuits: HeatingCircuit[]
  energySources: EnergySource[]
  fuelStocks: FuelStock[]
  fuelDeliveries: FuelDelivery[]
  meterBillingStatuses: MeterBillingStatus[]
  auditEvents: AuditEvent[]
}

export function createMigrationState(): MigrationState {
  return {
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
    meterBillingStatuses: [],
    auditEvents: [],
  }
}

export function toAppDataFile(
  state: MigrationState,
  savedAt: string | null | undefined,
  migratedAt: string,
  sourceSha256: string,
  appVersion: string | undefined,
): AppDataFile {
  return {
    schemaVersion: 4,
    meta: {
      savedAt,
      appVersion,
      migratedFrom: { schemaVersion: 3, sourceSha256, migratedAt },
    },
    masterData: {
      organizations: state.organizations,
      ownerCompanies: state.ownerCompanies,
      properties: state.properties,
      buildings: state.buildings,
      units: state.units,
      persons: state.persons,
      tenancies: state.tenancies,
      allocationRules: state.allocationRules,
      heatingSystems: state.heatingSystems,
      meters: state.meters,
    },
    billingData: {
      billingPeriods: state.billingPeriods,
      occupancyPeriods: state.occupancyPeriods,
      prepayments: state.prepayments,
      costCategories: state.costCategories,
      costEntries: state.costEntries,
      bankBookings: state.bankBookings,
      heatingCircuits: state.heatingCircuits,
      energySources: state.energySources,
      fuelStocks: state.fuelStocks,
      fuelDeliveries: state.fuelDeliveries,
      meterReadings: [],
      meterBillingStatuses: state.meterBillingStatuses,
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: state.auditEvents,
    },
  }
}
