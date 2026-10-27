import type { YearOverYearReport, YearOverYearValue } from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'

/** Byte Order Mark, damit Excel die Datei als UTF-8 liest. */
const BOM = String.fromCharCode(0xfeff)

type Compared = Extract<YearOverYearReport, { status: 'compared' }>

export interface YearOverYearRow {
  readonly area: 'Gesamt' | 'Kostenart' | 'Heizkreis' | 'Wohnung'
  readonly label: string
  readonly value: YearOverYearValue
  /** Zusatzinformation, z. B. Kosten je kWh oder Nutzerwechsel. */
  readonly note: string
}

const decimal = (value: number, digits = 2) =>
  value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

export function euroText(cents: number | null): string {
  return cents === null ? '' : decimal(cents / 100)
}

export function percentText(ratio: number | null): string {
  return ratio === null
    ? ''
    : `${ratio > 0 ? '+' : ''}${decimal(ratio * 100, 1)} %`
}

/** Alle Zeilen des Berichts in fester Reihenfolge (Gesamt, Kosten, Heizung, Wohnungen). */
export function yearOverYearRows(
  data: AppDataFile,
  report: Compared,
): YearOverYearRow[] {
  const building = (id: string) =>
    data.masterData.buildings.find((item) => item.id === id)?.name ?? id
  const unit = (id: string) => {
    const found = data.masterData.units.find((item) => item.id === id)
    return found?.label || found?.location || id
  }
  return [
    { area: 'Gesamt', label: 'Erfasste Kosten', value: report.total, note: '' },
    ...report.costs.map((row) => ({
      area: 'Kostenart' as const,
      label: row.label,
      value: row,
      note:
        row.presence === 'new'
          ? `neu ${report.currentYear}`
          : row.presence === 'dropped'
            ? `entfallen ${report.currentYear}`
            : '',
    })),
    ...report.circuits.map((row) => ({
      area: 'Heizkreis' as const,
      label: building(row.buildingId),
      value: row,
      note: [
        row.previousCentsPerKwh !== null && row.currentCentsPerKwh !== null
          ? `${decimal(row.previousCentsPerKwh)} → ${decimal(row.currentCentsPerKwh)} ct/kWh${row.centsPerKwhOutlier ? ' (auffällig)' : ''}`
          : '',
        row.previousAdjustedKwh !== null && row.currentAdjustedKwh !== null
          ? `witterungsbereinigt ${decimal(row.previousAdjustedKwh, 0)} → ${decimal(row.currentAdjustedKwh, 0)} kWh`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    })),
    ...report.units.map((row) => ({
      area: 'Wohnung' as const,
      label: unit(row.unitId),
      value: row,
      note: [
        row.tenantChanged ? 'Nutzerwechsel' : '',
        row.previousVacancyDays || row.currentVacancyDays
          ? `Leerstand ${row.previousVacancyDays} → ${row.currentVacancyDays} Tage`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    })),
  ]
}

function csvCell(value: string): string {
  return /[";\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * Freitext (Kostenart, Gebäude, Wohnung) darf in Excel nicht als Formel
 * ausgeführt werden (CSV-Injection): führendes `=`, `+`, `-`, `@`, Tab oder
 * CR wird mit `'` entschärft. Zahlenspalten laufen bewusst nicht hier
 * durch, weil „Veränderung %“ mit Vorzeichen beginnt.
 */
export function textCell(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value
}

/**
 * CSV (Semikolon, deutsche Zahlen) für Excel; Spalte „Erklärung“ bleibt
 * leer und wird vom Vermieter ausgefüllt.
 */
export function yearOverYearCsv(data: AppDataFile, report: Compared): string {
  const header = [
    'Bereich',
    'Position',
    `${report.previousYear} €`,
    `${report.currentYear} €`,
    'Veränderung €',
    'Veränderung %',
    'Ausreißer',
    'Hinweis',
    'Erklärung',
  ]
  const lines = yearOverYearRows(data, report).map((row) =>
    [
      textCell(row.area),
      textCell(row.label),
      euroText(row.value.previousCents),
      euroText(row.value.currentCents),
      euroText(row.value.changeCents),
      percentText(row.value.changeRatio),
      row.value.outlier ? 'ja' : '',
      textCell(row.note),
      '',
    ]
      .map(csvCell)
      .join(';'),
  )
  return `${BOM}${[header.join(';'), ...lines].join('\r\n')}\r\n`
}
