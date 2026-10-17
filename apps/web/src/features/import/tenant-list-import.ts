import type {
  TenantListIssue,
  TenantListPrepayment,
  TenantListRow,
} from '@nebenkosten/import-export'
import type { AppDataFile, Unit } from '@nebenkosten/schema'
import { addUnit } from '../master-data/commands'
import {
  addTenantOccupancy,
  addVacancyOccupancy,
} from '../occupancies/commands'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'

export interface TenantListPlanRow {
  readonly line: number
  readonly unitLabel: string
  readonly newUnit: boolean
  readonly displayName?: string
  readonly from?: string
  readonly to?: string
  readonly prepayment?: TenantListPrepayment
}

export interface TenantListImportResult {
  readonly file: AppDataFile
  readonly plan: TenantListPlanRow[]
}

export class TenantListImportError extends Error {
  override readonly name = 'TenantListImportError'
  constructor(readonly issues: readonly TenantListIssue[]) {
    super(
      issues.length === 1
        ? `Zeile ${issues[0]!.line}: ${issues[0]!.message}`
        : `${issues.length} Zeilen der Mieterliste müssen korrigiert werden.`,
    )
  }
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE')
}

function sameArea(
  stored: Unit['usableAreaSqm'],
  given: number | undefined,
): boolean {
  return given === undefined || stored?.value === given
}

/**
 * Übernimmt eine geprüfte Mieterliste in ein Abrechnungsjahr: vorhandene
 * Wohnungen werden über die Bezeichnung zugeordnet, fehlende angelegt;
 * je Zeile entsteht eine Belegung (Mieter mit Vorauszahlung oder Leerstand).
 * Alles oder nichts: bei einem Fehler wird nichts übernommen und jede
 * betroffene Zeile gemeldet. Abweichende Stammdaten (Fläche, Gebäude)
 * werden nie still überschrieben.
 */
export function importTenantList(
  file: AppDataFile,
  billingPeriodId: string,
  rows: readonly TenantListRow[],
  createId: () => string = () => crypto.randomUUID(),
): TenantListImportResult {
  const period = file.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    throw new TenantListImportError([
      { line: 1, message: 'Abrechnungsjahr wurde nicht gefunden.' },
    ])
  if (!rows.length)
    throw new TenantListImportError([
      { line: 1, message: 'Die Mieterliste enthält keine Zeilen.' },
    ])
  const plan: TenantListPlanRow[] = []
  const issues: TenantListIssue[] = []
  const createdUnitIds = new Set<string>()

  const result = applyEditableBillingPeriodChange(
    file,
    billingPeriodId,
    (source) => {
      let current = source
      const buildings = current.masterData.buildings.filter(
        ({ propertyId }) => propertyId === period.propertyId,
      )
      for (const row of rows) {
        try {
          let buildingId: string | undefined
          if (row.building) {
            const matches = buildings.filter(
              (b) =>
                key(b.name) === key(row.building!) ||
                (b.shortName && key(b.shortName) === key(row.building!)),
            )
            if (matches.length !== 1)
              throw new Error(
                `Gebäude „${row.building}“ ist nicht eindeutig angelegt; bitte zuerst unter Stammdaten anlegen.`,
              )
            buildingId = matches[0]!.id
          }
          const units = current.masterData.units.filter(
            (u) =>
              u.propertyId === period.propertyId &&
              key(u.label ?? '') === key(row.unit),
          )
          if (units.length > 1)
            throw new Error(
              `Wohnung „${row.unit}“ ist mehrfach angelegt; bitte Bezeichnungen eindeutig machen.`,
            )
          let unit = units[0]
          if (unit) {
            if (buildingId && unit.buildingId !== buildingId)
              throw new Error(
                `Wohnung „${row.unit}“ gehört zu einem anderen Gebäude.`,
              )
            if (
              !sameArea(unit.usableAreaSqm, row.usableAreaSqm) ||
              !sameArea(unit.heatedAreaSqm, row.heatedAreaSqm)
            )
              throw new Error(
                `Fläche von „${row.unit}“ weicht von den Stammdaten ab; bitte Fläche in der Liste leeren oder die Stammdaten ändern.`,
              )
          } else {
            const before = current.masterData.units.length
            current = addUnit(
              current,
              {
                propertyId: period.propertyId,
                label: row.unit,
                ...(buildingId ? { buildingId } : {}),
                ...(row.location ? { location: row.location } : {}),
                ...(row.usableAreaSqm === undefined
                  ? {}
                  : { usableAreaSqm: row.usableAreaSqm }),
                ...(row.heatedAreaSqm === undefined
                  ? {}
                  : { heatedAreaSqm: row.heatedAreaSqm }),
              },
              { createId },
            )
            unit = current.masterData.units[before]!
            createdUnitIds.add(unit.id)
          }
          const range = {
            ...(row.from ? { from: row.from } : {}),
            ...(row.to ? { to: row.to } : {}),
          }
          current = row.tenant
            ? addTenantOccupancy(
                current,
                {
                  billingPeriodId,
                  unitId: unit.id,
                  person: {
                    displayName: row.tenant.displayName,
                    ...(row.tenant.email ? { email: row.tenant.email } : {}),
                  },
                  occupancy: {
                    ...range,
                    ...(row.tenant.persons === undefined
                      ? {}
                      : { persons: row.tenant.persons }),
                  },
                  prepayment: row.tenant.prepayment,
                },
                createId,
              )
            : addVacancyOccupancy(
                current,
                { billingPeriodId, unitId: unit.id, ...range },
                createId,
              )
          plan.push({
            line: row.line,
            unitLabel: row.unit,
            newUnit: createdUnitIds.has(unit.id),
            ...(row.tenant
              ? {
                  displayName: row.tenant.displayName,
                  prepayment: row.tenant.prepayment,
                }
              : {}),
            ...range,
          })
        } catch (caught) {
          issues.push({
            line: row.line,
            message:
              caught instanceof Error ? caught.message : 'Zeile ist ungültig.',
          })
        }
      }
      if (issues.length) throw new TenantListImportError(issues)
      return current
    },
  )
  return { file: result, plan }
}
