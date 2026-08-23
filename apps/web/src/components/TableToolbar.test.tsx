import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TableToolbar } from './TableToolbar'

afterEach(cleanup)

describe('TableToolbar', () => {
  it('verbindet Suche, Schnellfilter und eine sichere Ergebnissumme', () => {
    const onSearchChange = vi.fn()
    const onFilterChange = vi.fn()

    render(
      <TableToolbar
        searchLabel="Buchungen durchsuchen"
        searchValue=""
        onSearchChange={onSearchChange}
        filterLabel="Buchungsansicht"
        filterValue="all"
        onFilterChange={onFilterChange}
        filterOptions={[
          { value: 'all', label: 'Alle' },
          { value: 'unassigned', label: 'Nicht zugeordnet' },
        ]}
        resultCount={3}
        resultLabel="Buchungen"
        resultSingularLabel="Buchung"
        totalCents={-12_345}
      />,
    )

    fireEvent.change(screen.getByLabelText('Buchungen durchsuchen'), {
      target: { value: 'wartung' },
    })
    fireEvent.change(screen.getByLabelText('Buchungsansicht'), {
      target: { value: 'unassigned' },
    })

    expect(onSearchChange).toHaveBeenCalledWith('wartung')
    expect(onFilterChange).toHaveBeenCalledWith('unassigned')
    expect(screen.getByRole('status')).toHaveTextContent('3 Buchungen')
    expect(screen.getByRole('status')).toHaveTextContent('-123,45')
  })
})
