import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CostCategoryFields } from './CostFields'

afterEach(cleanup)

describe('Messdienstentgelt-Feld', () => {
  it('wird nur bei Heizkosten angezeigt und bietet eine echte Dreifachauswahl', () => {
    render(<CostCategoryFields buildings={[]} />)
    expect(
      screen.queryByLabelText('Messdienstentgelt (§ 6a HeizKV)'),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'heating' },
    })
    const selector = screen.getByLabelText('Messdienstentgelt (§ 6a HeizKV)')
    expect(selector).toHaveValue('')
    fireEvent.change(selector, { target: { value: 'false' } })
    expect(selector).toHaveValue('false')
    fireEvent.change(screen.getByLabelText('Typ'), {
      target: { value: 'water' },
    })
    expect(
      screen.queryByLabelText('Messdienstentgelt (§ 6a HeizKV)'),
    ).not.toBeInTheDocument()
  })
})
