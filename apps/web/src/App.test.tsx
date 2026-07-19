import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('App', () => {
  it('shows the complete billing workflow and a clear local save status', () => {
    render(<App initialPath="/" />)

    expect(
      screen.getByRole('heading', { name: 'Abrechnung im Blick' }),
    ).toBeVisible()
    expect(screen.getByText('Noch nicht gespeichert')).toBeVisible()

    const navigation = screen.getByRole('navigation', {
      name: 'Abrechnungsbereiche',
    })
    for (const label of [
      'Übersicht',
      'Firmen',
      'Objekte',
      'Abrechnungsjahre',
      'Nutzer',
      'Kosten',
      'Heizkreise',
      'Berechnung',
      'Freigabe',
    ]) {
      expect(
        within(navigation).getByRole('link', { name: label }),
      ).toBeVisible()
    }
  })

  it('navigates between workflow areas without reloading the page', () => {
    render(<App initialPath="/" />)

    fireEvent.click(screen.getByRole('link', { name: 'Kosten' }))

    expect(
      screen.getByRole('heading', { name: 'Kosten erfassen' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Kosten' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens a requested workflow area directly', () => {
    render(<App initialPath="/freigabe" />)

    expect(
      screen.getByRole('heading', { name: 'Abrechnung freigeben' }),
    ).toBeVisible()
  })

  it('falls back to the dashboard for unknown paths', () => {
    render(<App initialPath="/nicht-vorhanden" />)

    expect(
      screen.getByRole('heading', { name: 'Abrechnung im Blick' }),
    ).toBeVisible()
  })

  it('shows safe empty states for calculation, release and data entry', () => {
    render(<App initialPath="/berechnung" />)
    expect(screen.getByText('Noch nicht berechenbar')).toBeVisible()

    cleanup()
    render(<App initialPath="/freigabe" />)
    expect(screen.getByText('Freigabe ist noch gesperrt')).toBeVisible()
    expect(screen.getByText('0/4')).toBeVisible()

    cleanup()
    render(<App initialPath="/firmen" />)
    expect(screen.getByRole('button', { name: 'Firma anlegen' })).toBeDisabled()
  })

  it('uses hash navigation and follows browser navigation events', () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'Kosten' }))
    expect(window.location.hash).toBe('#/kosten')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    window.location.hash = '#/objekte'
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(
      screen.getByRole('heading', { name: 'Objekte verwalten' }),
    ).toBeVisible()

    window.location.hash = '#/freigabe'
    fireEvent(window, new PopStateEvent('popstate'))
    expect(
      screen.getByRole('heading', { name: 'Abrechnung freigeben' }),
    ).toBeVisible()
  })

  it('does not change the active route when the skip link is used', () => {
    window.location.hash = '#/kosten'
    render(<App />)

    fireEvent.click(screen.getByRole('link', { name: 'Zum Inhalt springen' }))
    window.location.hash = '#main-content'
    fireEvent(window, new HashChangeEvent('hashchange'))

    expect(
      screen.getByRole('heading', { name: 'Kosten erfassen' }),
    ).toBeVisible()
  })
})
