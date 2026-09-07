import { Fragment, type FormEvent } from 'react'
import type {
  AppDataFile,
  OccupancyPeriod,
  BillingPeriod,
  Unit,
} from '@nebenkosten/schema'
import { validateBillingPeriod } from '@nebenkosten/validators'
import { OccupancyEditor } from './OccupancyEditor'
interface Props {
  data: AppDataFile
  occupancy: OccupancyPeriod
  period: BillingPeriod
  unit: Unit
  validationIssues: ReturnType<typeof validateBillingPeriod>['issues']
  editingId: string | null
  deleteId: string | null
  setEditingId: (id: string | null) => void
  setDeleteId: (id: string | null) => void
  saveTenant: (event: FormEvent<HTMLFormElement>, id: string) => void
  saveVacancy: (event: FormEvent<HTMLFormElement>, id: string) => void
  confirmDelete: (id: string) => void
}
const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})
function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}
export function OccupancyRows({
  data,
  occupancy,
  period,
  unit,
  validationIssues,
  editingId,
  deleteId,
  setEditingId,
  setDeleteId,
  saveTenant,
  saveVacancy,
  confirmDelete,
}: Props) {
  const tenancy = data.masterData.tenancies.find(
    ({ id }) => id === occupancy.tenancyId,
  )
  const person = data.masterData.persons.find(({ id }) =>
    tenancy?.personIds.includes(id),
  )
  const currentPrepayment = data.billingData.prepayments.find(
    ({ occupancyPeriodId }) => occupancyPeriodId === occupancy.id,
  )
  const name =
    occupancy.kind === 'vacancy'
      ? 'Leerstand'
      : (person?.displayName ?? 'Nutzer ohne Anzeigename')
  const amount =
    currentPrepayment?.mode === 'monthly'
      ? currentPrepayment.monthlyAmountCents
      : currentPrepayment?.mode === 'annual'
        ? currentPrepayment.annualAmountCents
        : undefined

  const scopeBuildingId =
    occupancy.costScope?.kind === 'building'
      ? occupancy.costScope.buildingId
      : undefined
  const scope = scopeBuildingId
    ? (data.masterData.buildings.find(({ id }) => id === scopeBuildingId)
        ?.name ?? 'Gebäude')
    : 'Gesamtes Objekt'
  const prepayment =
    currentPrepayment?.mode === 'monthly'
      ? `${euroFormatter.format((amount ?? 0) / 100)} / Monat`
      : currentPrepayment?.mode === 'annual'
        ? `${euroFormatter.format((amount ?? 0) / 100)} / Jahr`
        : 'Keine vereinbart'
  const relatedIds = new Set([
    occupancy.id,
    occupancy.unitId,
    occupancy.tenancyId,
  ])
  const rowIssues = validationIssues.filter(
    (issue) => issue.entity && relatedIds.has(issue.entity.id),
  )
  const hasErrors = rowIssues.some(({ severity }) => severity === 'error')
  return (
    <Fragment key={occupancy.id}>
      <tr
        className="data-table__interactive-row"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter') {
            event.preventDefault()
            setEditingId(occupancy.id)
          }
          if (event.key === 'Escape') {
            setEditingId(null)
            setDeleteId(null)
          }
        }}
      >
        <td>
          <strong>{unit?.label ?? 'Einheit'}</strong>
        </td>
        <td>
          <strong>{name}</strong>
          <small>{occupancy.kind === 'vacancy' ? 'Leerstand' : 'Nutzer'}</small>
        </td>
        <td>
          {formatDate(occupancy.from ?? period.periodStart)} –{' '}
          {formatDate(occupancy.to ?? period.periodEnd)}
        </td>
        <td>{unit?.usableAreaSqm?.value ?? '–'} m²</td>
        <td>{occupancy.persons?.value ?? '–'}</td>
        <td>{prepayment}</td>
        <td>{scope}</td>
        <td>
          {rowIssues.length === 0 ? (
            <span className="table-status table-status--ready">
              Vollständig
            </span>
          ) : (
            <>
              <span className="table-status table-status--open">
                {hasErrors ? 'Prüfen' : 'Hinweis'}
              </span>
              <small>
                {rowIssues
                  .slice(0, 2)
                  .map(({ title }) => title)
                  .join(' · ')}
              </small>
            </>
          )}
        </td>
        <td className="data-table__actions">
          <button
            type="button"
            aria-label={`${name} bearbeiten`}
            aria-expanded={editingId === occupancy.id}
            onClick={() =>
              setEditingId(editingId === occupancy.id ? null : occupancy.id)
            }
          >
            Bearbeiten
          </button>
          <button type="button" onClick={() => setDeleteId(occupancy.id)}>
            {occupancy.kind === 'vacancy'
              ? 'Leerstand löschen'
              : 'Nutzer löschen'}
          </button>
        </td>
      </tr>
      {editingId === occupancy.id || deleteId === occupancy.id ? (
        <tr className="data-table__detail-row">
          <td colSpan={9}>
            <div className="record-editor record-editor--embedded">
              {editingId === occupancy.id ? (
                <OccupancyEditor
                  data={data}
                  occupancy={occupancy}
                  period={period}
                  saveTenant={saveTenant}
                  saveVacancy={saveVacancy}
                />
              ) : null}
              <div className="danger-zone">
                {deleteId === occupancy.id ? (
                  <>
                    <p>
                      Dieser Zeitraum und seine Vorauszahlung werden entfernt.
                    </p>
                    <button
                      type="button"
                      onClick={() => confirmDelete(occupancy.id)}
                    >
                      Löschen bestätigen
                    </button>
                    <button type="button" onClick={() => setDeleteId(null)}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteId(occupancy.id)}
                  >
                    {occupancy.kind === 'vacancy'
                      ? 'Leerstand löschen'
                      : 'Nutzer löschen'}
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}
