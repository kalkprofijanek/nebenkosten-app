import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('labels the workspace as a development scaffold', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Nebenkosten-App' }),
    ).toBeVisible()
    expect(screen.getByText('Technisches Grundgerüst')).toBeVisible()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })
})
