interface TableFilterOption {
  readonly value: string
  readonly label: string
}

interface TableToolbarProps {
  readonly searchLabel: string
  readonly searchValue: string
  readonly searchPlaceholder?: string
  readonly onSearchChange: (value: string) => void
  readonly filterLabel?: string
  readonly filterValue?: string
  readonly onFilterChange?: (value: string) => void
  readonly filterOptions?: readonly TableFilterOption[]
  readonly resultCount: number
  readonly resultLabel: string
  readonly resultSingularLabel?: string
  readonly totalCents?: number
}

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function TableToolbar({
  searchLabel,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  filterLabel,
  filterValue,
  onFilterChange,
  filterOptions,
  resultCount,
  resultLabel,
  resultSingularLabel,
  totalCents,
}: TableToolbarProps) {
  return (
    <div className="table-toolbar">
      <label className="table-toolbar__search">
        <span>{searchLabel}</span>
        <input
          type="search"
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>
      {filterLabel &&
      filterValue !== undefined &&
      onFilterChange &&
      filterOptions ? (
        <label>
          <span>{filterLabel}</span>
          <select
            value={filterValue}
            onChange={(event) => onFilterChange(event.currentTarget.value)}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <output className="table-toolbar__result" aria-live="polite">
        <strong>
          {resultCount}{' '}
          {resultCount === 1
            ? (resultSingularLabel ?? resultLabel)
            : resultLabel}
        </strong>
        {totalCents === undefined ? null : (
          <span>{euroFormatter.format(totalCents / 100)}</span>
        )}
      </output>
    </div>
  )
}
