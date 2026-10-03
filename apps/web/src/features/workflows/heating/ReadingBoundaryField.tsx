export function ReadingBoundaryField({
  value = '',
  editing = false,
}: {
  readonly value?: string | null
  readonly editing?: boolean
}) {
  return (
    <label>
      <span>{editing ? 'Ablesezeitpunkt bearbeiten' : 'Ablesezeitpunkt'}</span>
      <select name="boundary" defaultValue={value ?? ''}>
        <option value="">Nicht bestätigt</option>
        <option value="start_of_day">Tagesanfang (vor Nutzung)</option>
        <option value="end_of_day">Tagesende (nach Nutzung)</option>
      </select>
    </label>
  )
}
