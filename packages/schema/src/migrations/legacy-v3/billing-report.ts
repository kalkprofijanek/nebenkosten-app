import type { V3Abrechnung } from '../..'
import type { JsonPath } from './context'
import { MigrationContext } from './context'

export const REDACTED_COST_KEY = '<cost-key>'

export function reportBillingPeriodChanges(
  context: MigrationContext,
  period: V3Abrechnung,
  sourcePath: JsonPath,
  targetIndex: number,
  hasLegacyUnmapped: boolean,
): void {
  const targetPath: JsonPath = ['billingData', 'billingPeriods', targetIndex]
  context.change([...sourcePath, 'id'], [...targetPath, 'id'], 'verbatim')
  context.change(
    [...sourcePath, 'jahr'],
    [...targetPath, 'year'],
    'numberish_to_number',
  )
  context.change(
    [...sourcePath, 'zeitraum', 'von'],
    [...targetPath, 'periodStart'],
    'date_to_iso',
  )
  context.change(
    [...sourcePath, 'zeitraum', 'bis'],
    [...targetPath, 'periodEnd'],
    'date_to_iso',
  )
  if (period.status !== undefined)
    context.change(
      [...sourcePath, 'status'],
      [...targetPath, 'status'],
      'enum_map',
    )
  if (period.vorgaben?.verbrauch_proz !== undefined)
    context.change(
      [...sourcePath, 'vorgaben', 'verbrauch_proz'],
      [...targetPath, 'heatingDefaults', 'consumptionSharePercent'],
      'numberish_to_number',
    )
  if (period.gesamt?.flaeche !== undefined)
    context.change(
      [...sourcePath, 'gesamt', 'flaeche'],
      [...targetPath, 'totals', 'usableAreaSqm'],
      'quantity_wrap',
    )
  if (period.standardKostenartenStatus)
    for (const value of Object.values(period.standardKostenartenStatus))
      if (value.aktiv !== undefined)
        context.change(
          [
            ...sourcePath,
            'standardKostenartenStatus',
            REDACTED_COST_KEY,
            'aktiv',
          ],
          [
            ...targetPath,
            'standardCostCategoryStatus',
            REDACTED_COST_KEY,
            'active',
          ],
          'booleanish_to_boolean',
        )
  if (period._ts !== undefined)
    context.change(
      [...sourcePath, '_ts'],
      [...targetPath, 'lastModifiedAt'],
      'ms_epoch_to_iso',
    )
  if (hasLegacyUnmapped)
    context.change(
      sourcePath,
      [...targetPath, 'legacyUnmapped'],
      'preserve_unknown',
    )
}
