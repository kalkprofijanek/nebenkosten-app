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

  it('zeigt Einzahl ohne Summe und verwendet ersatzweise die Mehrzahlbezeichnung', () => {
    render(
      <TableToolbar
        searchLabel="Kostenarten durchsuchen"
        searchValue="wartung"
        onSearchChange={vi.fn()}
        filterLabel="Kostenart-Typ"
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={[{ value: 'all', label: 'Alle' }]}
        resultCount={1}
        resultLabel="Kostenarten"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('1 Kostenarten')
    expect(screen.getByRole('status').querySelector('span')).toBeNull()
  })

  it('unterstuetzt reine Suchleisten ohne bedeutungslosen Schnellfilter', () => {
    render(
      <TableToolbar
        searchLabel="Firmen durchsuchen"
        searchValue=""
        onSearchChange={vi.fn()}
        resultCount={2}
        resultLabel="Firmen"
        resultSingularLabel="Firma"
      />,
    )

    expect(screen.getByLabelText('Firmen durchsuchen')).toBeVisible()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('2 Firmen')
  })
})
