import { useState, type ComponentProps } from 'react'
import type { OccupancyPeriod, Unit } from '@nebenkosten/schema'
import { validateBillingPeriodCached } from '@nebenkosten/validators'
import { TableToolbar } from '../../components/TableToolbar'
import { OccupancyRows } from './OccupancyRows'
import { unitOccupancies } from './unit-occupancies'
import './unit-occupancies.css'

type Props = Omit<
  ComponentProps<typeof OccupancyRows>,
  'occupancy' | 'unit' | 'validationIssues'
> & {
  units: Unit[]
  occupancies: OccupancyPeriod[]
}
const numberFormatter = new Intl.NumberFormat('de-DE')
export function UnitOccupanciesOverview({
  units,
  occupancies,
  ...props
}: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const groups = unitOccupancies(
    props.data,
    props.period,
    units,
    occupancies,
    search,
    filter,
  )
  const { data, period } = props
  const validationIssues = (() => {
    try {
      return validateBillingPeriodCached(data, period.id).issues
    } catch {
      return []
    }
  })()
  return (
    <section
      className="editable-records unit-occupancies"
      aria-labelledby="occupancies-title"
    >
      <h2 id="occupancies-title">Wohnungen und Belegungen ({units.length})</h2>
      <p>
        Alle erfassten Zeiträume im gewählten Abrechnungsjahr. Suche und Filter
        wählen Wohnungen; ihre vollständige Belegung bleibt sichtbar.
      </p>
      <TableToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Wohnungen durchsuchen"
        searchPlaceholder="Wohnung, Gebäude, Lage, Nutzer oder Notiz"
        filterValue={filter}
        onFilterChange={setFilter}
        filterLabel="Belegungsstatus"
        filterOptions={[
          { value: 'all', label: 'Alle Wohnungen' },
          { value: 'tenant', label: 'Mit Nutzerzeitraum' },
          { value: 'vacancy', label: 'Mit Leerstandszeitraum' },
          { value: 'empty', label: 'Ohne erfasste Belegung' },
        ]}
        resultCount={groups.length}
        resultLabel="Wohnungen"
        resultSingularLabel="Wohnung"
      />
      {groups.length === 0 ? (
        <p className="table-empty-state">
          Für diese Suche wurden keine Wohnungen gefunden.
        </p>
      ) : (
        groups.map(({ unit, timeline, building, status }) => (
          <section
            key={unit.id}
            className="unit-occupancies__unit"
            aria-labelledby={`unit-heading-${unit.id}`}
          >
            <header className="unit-occupancies__heading">
              <h3 id={`unit-heading-${unit.id}`}>
                {unit.label || 'Wohnung ohne Bezeichnung'}
              </h3>
              <dl>
                <div>
                  <dt>Gebäude</dt>
                  <dd>{building?.name ?? 'Nicht zugeordnet'}</dd>
                </div>
                <div>
                  <dt>Lage</dt>
                  <dd>{unit.location || 'Nicht erfasst'}</dd>
                </div>
                <div>
                  <dt>Nutzfläche</dt>
                  <dd>
                    {unit.usableAreaSqm == null
                      ? 'Nicht erfasst'
                      : `${numberFormatter.format(unit.usableAreaSqm.value)} m²`}
                  </dd>
                </div>
                <div>
                  <dt>Belegung im Abrechnungsjahr</dt>
                  <dd>{status}</dd>
                </div>
              </dl>
            </header>
            {timeline.length === 0 ? (
              <p className="unit-occupancies__empty">
                Für diese Wohnung sind im gewählten Abrechnungsjahr noch keine
                Nutzer- oder Leerstandszeiträume erfasst.
              </p>
            ) : (
              <div
                className="data-table-wrap data-table-wrap--workspace"
                tabIndex={0}
                role="region"
                aria-label={`Belegungszeiträume ${unit.label || 'Wohnung ohne Bezeichnung'}`}
              >
                <table
                  className="data-table data-table--workspace"
                  aria-label={`Belegung ${unit.label || 'Wohnung ohne Bezeichnung'}`}
                >
                  <thead>
                    <tr>
                      {[
                        'Einheit',
                        'Nutzer / Art',
                        'Zeitraum',
                        'Fläche',
                        'Personen',
                        'Vorauszahlung',
                        'Kostenbereich',
                        'Status',
                        'Aktion',
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((occupancy) => (
                      <OccupancyRows
                        key={occupancy.id}
                        {...props}
                        unit={unit}
                        occupancy={occupancy}
                        validationIssues={validationIssues}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </section>
  )
}
