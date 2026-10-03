import type { Content, TableCell } from 'pdfmake/interfaces'
import type { CalculationOutput } from '@nebenkosten/core'
import { formatIsoDate } from './format'

/** Values and labels come exclusively from the saved calculation trace. */
export function meteringStatement(
  calculation: CalculationOutput,
  occupancyId?: string,
): Content[] {
  const trace = calculation.meteringTrace
  if (!trace) return []
  const rows = trace.circuits.flatMap((circuit) =>
    circuit.occupancies
      .filter(
        (occupancy) =>
          occupancyId === undefined || occupancy.occupancyId === occupancyId,
      )
      .flatMap((occupancy) =>
        occupancy.meters.map((meter): TableCell[] => [
          meter.meterNumber ?? meter.meterId,
          `${formatIsoDate(occupancy.from)} – ${formatIsoDate(occupancy.to)}`,
          `${meter.startValue} kWh\n${formatIsoDate(meter.startReadingDate)} ${meter.startBoundary === 'start_of_day' ? 'Tagesanfang' : 'Tagesende'}`,
          `${meter.endValue} kWh\n${formatIsoDate(meter.endReadingDate)} ${meter.endBoundary === 'start_of_day' ? 'Tagesanfang' : 'Tagesende'}`,
          `${meter.kwh} kWh`,
        ]),
      ),
  )
  if (rows.length === 0) return []
  return [
    {
      text: 'Nachweis des gemessenen Wärmeverbrauchs',
      style: 'th',
      margin: [0, 12, 0, 4],
    },
    {
      text: 'Verbrauch = Endstand minus Anfangsstand. Die Werte stammen aus dem gespeicherten Berechnungsstand.',
      fontSize: 8,
      margin: [0, 0, 0, 4],
    },
    {
      table: {
        headerRows: 1,
        widths: ['*', '*', '*', '*', 'auto'],
        body: [
          ['Zähler', 'Nutzerzeitraum', 'Anfang', 'Ende', 'Verbrauch'],
          ...rows,
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
  ]
}
