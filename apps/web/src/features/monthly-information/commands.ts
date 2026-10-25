import {
  planMonthlyMeterReadings,
  type MeterServiceReading,
  type MonthlyReadingsPlan,
} from '@nebenkosten/import-export'
import { appDataFileSchema, type AppDataFile } from '@nebenkosten/schema'
import { lockedStatus } from '../release/edit-guard'

export class MonthlyInformationCommandError extends Error {
  override readonly name = 'MonthlyInformationCommandError'
}

export interface ImportMonthlyMeterReadingsInput {
  readonly propertyId: string
  readonly rows: readonly MeterServiceReading[]
  readonly createId: () => string
}

export interface ImportMonthlyMeterReadingsResult {
  readonly data: AppDataFile
  readonly plan: MonthlyReadingsPlan
}

/**
 * Übernimmt monatliche Zählerstände (ADR-0014, Schritt 2). Der Plan wird auf
 * dem aktuellen Datenstand neu gebildet, damit zwischenzeitliche Änderungen
 * nicht übergangen werden. Übernommen wird nur ohne Probleme; Dubletten
 * bleiben unberührt, vorhandene Stände werden nie überschrieben.
 */
export function importMonthlyMeterReadings(
  data: AppDataFile,
  input: ImportMonthlyMeterReadingsInput,
): ImportMonthlyMeterReadingsResult {
  if (!data.masterData.properties.some(({ id }) => id === input.propertyId))
    throw new MonthlyInformationCommandError('Objekt wurde nicht gefunden.')
  const plan = planMonthlyMeterReadings(data, {
    propertyId: input.propertyId,
    rows: input.rows,
    createId: input.createId,
  })
  if (plan.problems.length > 0)
    throw new MonthlyInformationCommandError(
      `Der aktuelle Datenstand ergibt Probleme beim Import (${plan.problems.length}); es wurde nichts übernommen. Bitte die Datei erneut laden.`,
    )
  if (plan.readings.length === 0)
    throw new MonthlyInformationCommandError(
      'Keine neuen Zählerstände zum Übernehmen.',
    )
  // Im Messmodus fließen Zählerstände in die Jahresabrechnung ein: Stände in
  // einem gesperrten Abrechnungsjahr würden ein freigegebenes Ergebnis ändern.
  const locked = data.billingData.billingPeriods.filter(
    (period) =>
      period.propertyId === input.propertyId &&
      lockedStatus(period.status) &&
      plan.readings.some(
        ({ date }) =>
          date != null &&
          date >= period.periodStart &&
          date <= period.periodEnd,
      ),
  )
  if (locked.length > 0)
    throw new MonthlyInformationCommandError(
      `Zählerstände fallen in ein gesperrtes Abrechnungsjahr (${locked
        .map(({ year }) => year)
        .join(
          ', ',
        )}). Das Jahr zuerst wieder öffnen oder die betroffenen Zeilen aus der Datei entfernen.`,
    )
  const result = appDataFileSchema.safeParse({
    ...data,
    billingData: {
      ...data.billingData,
      meterReadings: [...data.billingData.meterReadings, ...plan.readings],
    },
  })
  if (!result.success)
    throw new MonthlyInformationCommandError(
      'Der neue Datenstand verletzt das Dateischema.',
    )
  return { data: result.data, plan }
}
