import { Fragment, type FormEvent } from 'react'
import type { CostCategory, CostEntry } from '@nebenkosten/schema'
import { TableToolbar } from '../../../components/TableToolbar'
import { CostCategoryFields } from './CostFields'
import type { previousYearCostCategories } from '../../costs/commands'

const costKindLabels: Readonly<Record<CostCategory['kind'], string>> = {
  operating: 'Betriebskosten',
  water: 'Wasser',
  heating: 'Heizung',
}

const allocationKeyLabels: Readonly<Record<string, string>> = {
  usable_area: 'Nutzfläche',
  heated_area: 'Beheizte Fläche',
  consumption_units: 'Verbrauchseinheiten',
  residential_units: 'Wohneinheiten',
  direct: 'Direkte Zuordnung',
}

type CarryOver = ReturnType<typeof previousYearCostCategories>

export interface CostCategoryWorkspaceProps {
  readonly categories: readonly CostCategory[]
  readonly entries: readonly CostEntry[]
  readonly visibleCategories: readonly CostCategory[]
  readonly buildings: readonly { readonly id: string; readonly name: string }[]
  readonly carryOver: CarryOver
  readonly editingId: string | null
  readonly search: string
  readonly filter: string
  readonly notice: string | null
  readonly onSearchChange: (value: string) => void
  readonly onFilterChange: (value: string) => void
  readonly onCopyPrevious: () => void
  readonly onCreate: (event: FormEvent<HTMLFormElement>) => void
  readonly onSave: (event: FormEvent<HTMLFormElement>, id: string) => void
  readonly onToggleEdit: (id: string | null) => void
  readonly onDelete: (id: string) => void
}

export function CostCategoryWorkspace({
  categories,
  entries,
  visibleCategories,
  buildings,
  carryOver,
  editingId,
  search,
  filter,
  notice,
  onSearchChange,
  onFilterChange,
  onCopyPrevious,
  onCreate,
  onSave,
  onToggleEdit,
  onDelete,
}: CostCategoryWorkspaceProps) {
  return (
    <>
      {carryOver.sourcePeriod && carryOver.candidates.length > 0 ? (
        <p>
          <button type="button" onClick={onCopyPrevious}>
            Kostenarten aus {carryOver.sourcePeriod.year} übernehmen (
            {carryOver.candidates.length})
          </button>{' '}
          Übernimmt Bezeichnung, Umlageschlüssel und Anteile – ohne Beträge und
          Belege.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <form noValidate onSubmit={onCreate}>
        <CostCategoryFields category={undefined} buildings={buildings} />
        <button type="submit">Kostenart anlegen</button>
      </form>
      <section className="editable-records" aria-labelledby="categories-title">
        <div className="data-panel__heading">
          <h2 id="categories-title">Kostenarten ({categories.length})</h2>
          <span>Regeln für das aktive Abrechnungsjahr</span>
        </div>
        {categories.length === 0 ? (
          <p>Noch keine Kostenart angelegt.</p>
        ) : (
          <>
            <TableToolbar
              searchLabel="Kostenarten durchsuchen"
              searchValue={search}
              onSearchChange={onSearchChange}
              filterLabel="Kostenart-Typ"
              filterValue={filter}
              onFilterChange={onFilterChange}
              filterOptions={[
                { value: 'all', label: 'Alle Kostenarten' },
                { value: 'operating', label: 'Betriebskosten' },
                { value: 'water', label: 'Wasser' },
                { value: 'heating', label: 'Heizung' },
              ]}
              resultCount={visibleCategories.length}
              resultLabel="Kostenarten"
              resultSingularLabel="Kostenart"
            />
            <div className="data-table-wrap data-table-wrap--workspace">
              <table
                className="data-table data-table--workspace"
                aria-label="Kostenarten bearbeiten"
              >
                <thead>
                  <tr>
                    <th scope="col">Kostenart</th>
                    <th scope="col">Typ</th>
                    <th scope="col">Umlageschlüssel</th>
                    <th scope="col">Bereich</th>
                    <th scope="col">Positionen</th>
                    <th scope="col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCategories.map((category) => {
                    const positionCount = entries.filter(
                      ({ costCategoryId }) => costCategoryId === category.id,
                    ).length
                    const scopeBuildingId =
                      category.scope?.kind === 'building'
                        ? category.scope.buildingId
                        : undefined
                    const scope = scopeBuildingId
                      ? (buildings.find(({ id }) => id === scopeBuildingId)
                          ?.name ?? 'Gebäude')
                      : 'Gesamtes Objekt'
                    return (
                      <Fragment key={category.id}>
                        <tr
                          className="data-table__interactive-row"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              onToggleEdit(category.id)
                            }
                            if (event.key === 'Escape') onToggleEdit(null)
                          }}
                        >
                          <td>
                            <strong>{category.label}</strong>
                            <small>
                              {category.statementText ??
                                'Kein abweichender Abrechnungstext'}
                            </small>
                          </td>
                          <td>{costKindLabels[category.kind]}</td>
                          <td>
                            {category.allocationKey
                              ? (allocationKeyLabels[category.allocationKey] ??
                                category.allocationKey)
                              : 'Nicht festgelegt'}
                          </td>
                          <td>{scope}</td>
                          <td>{positionCount}</td>
                          <td className="data-table__actions">
                            <button
                              type="button"
                              aria-label={`${category.label} bearbeiten`}
                              onClick={() =>
                                onToggleEdit(
                                  editingId === category.id
                                    ? null
                                    : category.id,
                                )
                              }
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(category.id)}
                            >
                              Kostenart löschen
                            </button>
                          </td>
                        </tr>
                        {editingId === category.id ? (
                          <tr className="data-table__detail-row">
                            <td colSpan={6}>
                              <article className="record-editor record-editor--embedded">
                                <h3>{category.label}</h3>
                                <form
                                  className="embedded-form"
                                  noValidate
                                  onSubmit={(event) =>
                                    onSave(event, category.id)
                                  }
                                >
                                  <CostCategoryFields
                                    category={category}
                                    buildings={buildings}
                                  />
                                  <button type="submit">
                                    Kostenart speichern
                                  </button>
                                </form>
                              </article>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}
