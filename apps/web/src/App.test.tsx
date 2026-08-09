import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { SelectionContext } from './app/selection'
import type { WorkspaceState } from './app/workspace-controller'

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
    expect(screen.getByText('Schema v4 · Version 1.0.1')).toBeVisible()

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

  it.each([
    ['conflict', false, false, 'Speicherkonflikt – nicht überschrieben'],
    ['blocked', false, false, 'Speicherstand ist geschützt'],
    ['error', false, false, 'Speichern nicht möglich'],
    ['ready', true, true, 'Änderungen werden gespeichert'],
    ['ready', true, false, 'Ungesicherte Änderungen'],
  ] as const)(
    'shows the safe %s storage state',
    (status, dirty, saving, label) => {
      const workspaceState: WorkspaceState = {
        status,
        data: null,
        revision: null,
        dirty,
        saving,
        errorCode: status === 'ready' ? null : 'io_failed',
      }
      render(<App initialPath="/" workspaceState={workspaceState} />)
      expect(screen.getByText(label)).toBeVisible()
    },
  )

  it('labels clean preview storage as session-only', () => {
    const workspaceState: WorkspaceState = {
      status: 'ready',
      data: null,
      revision: 'revision',
      dirty: false,
      saving: false,
      errorCode: null,
    }
    render(<App initialPath="/" previewMode workspaceState={workspaceState} />)
    expect(
      screen.getByText('Nur im Arbeitsspeicher – beim Neuladen verloren'),
    ).toBeVisible()
    expect(
      screen.getByText(/speichert Änderungen nicht dauerhaft/),
    ).toBeVisible()
  })

  it('zeigt den echten Fortschritt des lokalen Datenstands', () => {
    const empty = createEmptyAppDataFile()
    const data: AppDataFile = {
      ...empty,
      masterData: {
        ...empty.masterData,
        ownerCompanies: [
          {
            id: 'company-1',
            organizationId: 'organization-1',
            name: 'Firma',
            additionalNameLines: [],
          },
        ],
        properties: [{ id: 'property-1', ownerCompanyId: 'company-1' }],
      },
      billingData: {
        ...empty.billingData,
        billingPeriods: [
          {
            id: 'period-1',
            propertyId: 'property-1',
            year: 2026,
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
            status: 'DRAFT',
          },
        ],
      },
    }
    const workspaceState: WorkspaceState = {
      status: 'ready',
      data,
      revision: 'revision',
      dirty: false,
      saving: false,
      errorCode: null,
    }

    render(<App initialPath="/" workspaceState={workspaceState} />)

    expect(screen.getByText('3 von 10 Schritten')).toBeVisible()
    expect(screen.getAllByText('Erfasst')).toHaveLength(3)
    expect(
      screen.getByText(/Änderungen werden automatisch im lokalen Speicher/),
    ).toBeVisible()
  })

  it('zeigt und ändert den vollständigen aktiven Abrechnungskontext', () => {
    const empty = createEmptyAppDataFile()
    const data: AppDataFile = {
      ...empty,
      masterData: {
        ...empty.masterData,
        organizations: [{ id: 'org-1', name: 'Fiktive Verwaltung' }],
        ownerCompanies: [
          {
            id: 'company-1',
            organizationId: 'org-1',
            name: 'Beispiel Eigentum',
            additionalNameLines: [],
          },
        ],
        properties: [
          {
            id: 'property-1',
            ownerCompanyId: 'company-1',
            internalNumber: 'OBJ-17',
          },
        ],
      },
      billingData: {
        ...empty.billingData,
        billingPeriods: [
          {
            id: 'period-1',
            propertyId: 'property-1',
            year: 2026,
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
            status: 'IN_REVIEW',
          },
        ],
      },
    }
    const workspaceState: WorkspaceState = {
      status: 'ready',
      data,
      revision: 'revision',
      dirty: false,
      saving: false,
      errorCode: null,
    }
    const selection: SelectionContext = {
      ownerCompanyId: 'company-1',
      propertyId: 'property-1',
      billingPeriodId: 'period-1',
    }
    const onSelectionChange = vi.fn()

    render(
      <App
        initialPath="/"
        workspaceState={workspaceState}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />,
    )

    expect(screen.getByLabelText('Firma im Arbeitskontext')).toHaveValue(
      'company-1',
    )
    expect(screen.getByLabelText('Objekt im Arbeitskontext')).toHaveValue(
      'property-1',
    )
    expect(screen.getByLabelText('Zeitraum im Arbeitskontext')).toHaveValue(
      'period-1',
    )
    expect(screen.getByText('Prüfung offen')).toBeVisible()

    fireEvent.change(screen.getByLabelText('Objekt im Arbeitskontext'), {
      target: { value: 'property-1' },
    })
    expect(onSelectionChange).toHaveBeenCalledWith({
      propertyId: 'property-1',
      billingPeriodId: null,
    })
  })

  it('öffnet auf kleinen Ansichten eine beschriftete Bereichsnavigation', () => {
    render(<App initialPath="/" />)

    const menuButton = screen.getByRole('button', { name: 'Bereiche öffnen' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton)

    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('navigation', { name: 'Abrechnungsbereiche' }),
    ).toHaveClass('sidebar--open')
  })
})
