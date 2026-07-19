import { useEffect, useState, type MouseEvent } from 'react'

import { appRoutes, findRoute } from './app/navigation'
import type { WorkspaceState } from './app/workspace-controller'

interface AppProps {
  readonly initialPath?: string
  readonly onCreateWorkspace?: () => void
  readonly previewMode?: boolean
  readonly workspaceState?: WorkspaceState
}

const workflowRoutes = appRoutes.slice(1)

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function EmptyWorkspace({
  actionLabel,
  section,
}: {
  readonly actionLabel?: string
  readonly section: string
}) {
  if (section === 'Berechnung') {
    return (
      <section className="empty-panel" aria-labelledby="calculation-empty">
        <span className="empty-panel__symbol" aria-hidden="true">
          ∑
        </span>
        <h2 id="calculation-empty">Noch nicht berechenbar</h2>
        <p>
          Lege zuerst Firma, Objekt, Abrechnungsjahr und die zugehörigen
          Abrechnungsdaten an.
        </p>
        <a className="button button--primary" href="#/firmen">
          Mit den Stammdaten beginnen
        </a>
      </section>
    )
  }

  if (section === 'Freigabe') {
    return (
      <section className="release-panel" aria-labelledby="release-status">
        <div>
          <span className="status-pill status-pill--draft">Entwurf</span>
          <h2 id="release-status">Freigabe ist noch gesperrt</h2>
          <p>
            Die fachlichen Freigabeprüfungen werden im nächsten geprüften
            Schritt ergänzt. Bis dahin kann kein Abschlussstatus gesetzt werden.
          </p>
        </div>
        <div
          className="release-score"
          aria-label="0 von 4 Prüfbereichen bereit"
        >
          <strong>0/4</strong>
          <span>Prüfbereiche bereit</span>
        </div>
      </section>
    )
  }

  return (
    <section className="empty-panel" aria-labelledby="empty-title">
      <span className="empty-panel__symbol" aria-hidden="true">
        +
      </span>
      <h2 id="empty-title">Noch keine Einträge</h2>
      <p>
        Dieser Bereich ist bereit. Beginne mit einem ersten Eintrag oder
        importiere später einen vorhandenen Datenbestand.
      </p>
      {actionLabel ? (
        <button
          className="button button--primary"
          type="button"
          disabled
          title="Die Eingabemaske folgt im nächsten UI-Meilenstein."
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  )
}

function Dashboard({
  onCreateWorkspace,
  workspaceState,
}: {
  readonly onCreateWorkspace?: () => void
  readonly workspaceState?: WorkspaceState
}) {
  const data = workspaceState?.data
  const objectCount = data?.masterData.properties.length ?? 0
  const periodCount = data?.billingData.billingPeriods.length ?? 0
  const userCount = data?.billingData.occupancyPeriods.length ?? 0

  return (
    <>
      {workspaceState?.status === 'empty' ? (
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div>
            <p className="section-kicker">Sicherer Start</p>
            <h2 id="welcome-title">Neuen Arbeitsbestand beginnen</h2>
            <p>
              Es ist noch kein lokaler Datenbestand vorhanden. Erst dein Klick
              legt eine gültige, leere Datei der Schema-Version 4 an.
            </p>
          </div>
          <button
            className="button button--primary"
            type="button"
            onClick={onCreateWorkspace}
            disabled={onCreateWorkspace === undefined}
          >
            Arbeitsbestand anlegen
          </button>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Aktueller Datenstand">
        {[
          [String(objectCount), 'Objekte'],
          [String(periodCount), 'Abrechnungsjahre'],
          [String(userCount), 'Nutzer'],
          ['Entwurf', 'Aktueller Status'],
        ].map(([value, label]) => (
          <article className="metric-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="workflow-card" aria-labelledby="workflow-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Geführter Ablauf</p>
            <h2 id="workflow-title">Von den Stammdaten zur Freigabe</h2>
          </div>
          <span className="progress-label">0 von 8 Schritten</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span />
        </div>
        <ol className="workflow-list">
          {workflowRoutes.map((route, index) => (
            <li key={route.path}>
              <a href={`#${route.path}`}>
                <span className="workflow-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{route.label}</strong>
                  <small>
                    {index === 0
                      ? 'Hier beginnt die neue Abrechnung'
                      : 'Wartet auf vorherige Angaben'}
                  </small>
                </span>
                <span className="workflow-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <aside className="privacy-note">
        <span className="privacy-note__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>Deine Daten bleiben auf diesem Gerät</strong>
          <p>
            Keine Cloud, kein Tracking. Der lokale Speicher wird im nächsten
            UI-Meilenstein angebunden.
          </p>
        </div>
      </aside>
    </>
  )
}

function saveLabel(state?: WorkspaceState, previewMode = false): string {
  if (state?.status === 'loading') return 'Lokaler Stand wird geladen'
  if (state?.status === 'empty') return 'Noch kein Arbeitsbestand'
  if (state?.status === 'conflict')
    return 'Speicherkonflikt – nicht überschrieben'
  if (state?.status === 'blocked') return 'Speicherstand ist geschützt'
  if (state?.status === 'error') return 'Speichern nicht möglich'
  if (state?.saving) return 'Änderungen werden gespeichert'
  if (state !== undefined && !state.dirty) {
    return previewMode
      ? 'Nur im Arbeitsspeicher – beim Neuladen verloren'
      : 'Lokal gespeichert'
  }
  if (state?.dirty) return 'Ungesicherte Änderungen'
  return 'Noch nicht gespeichert'
}

export function App({
  initialPath,
  onCreateWorkspace,
  previewMode,
  workspaceState,
}: AppProps) {
  const [path, setPath] = useState(
    initialPath ??
      (globalThis.location?.hash.startsWith('#/')
        ? globalThis.location.hash.slice(1)
        : globalThis.location?.pathname) ??
      '/',
  )
  const route = findRoute(path)

  useEffect(() => {
    if (initialPath !== undefined) return

    const handlePopState = () => {
      if (globalThis.location.hash === '#main-content') return
      setPath(
        globalThis.location.hash.startsWith('#/')
          ? globalThis.location.hash.slice(1)
          : '/',
      )
    }
    globalThis.addEventListener('popstate', handlePopState)
    globalThis.addEventListener('hashchange', handlePopState)
    return () => {
      globalThis.removeEventListener('popstate', handlePopState)
      globalThis.removeEventListener('hashchange', handlePopState)
    }
  }, [initialPath])

  function navigate(event: MouseEvent<HTMLAnchorElement>, nextPath: string) {
    event.preventDefault()
    if (initialPath === undefined) {
      globalThis.location.hash = nextPath
      globalThis.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setPath(nextPath)
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>

      <aside className="sidebar">
        <a
          className="brand"
          href="#/"
          onClick={(event) => navigate(event, '/')}
          aria-label="Nebenkosten-App – Übersicht"
        >
          <BrandMark />
          <span>
            <strong>Nebenkosten</strong>
            <small>Abrechnung lokal</small>
          </span>
        </a>

        <nav aria-label="Abrechnungsbereiche">
          <p className="navigation-label">Arbeitsbereiche</p>
          <ul className="navigation-list">
            {appRoutes.map((item, index) => (
              <li key={item.path}>
                <a
                  href={`#${item.path}`}
                  aria-label={item.label}
                  aria-current={route.path === item.path ? 'page' : undefined}
                  onClick={(event) => navigate(event, item.path)}
                >
                  <span className="navigation-icon" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="sidebar-footer">
          <div className="local-indicator">
            <span aria-hidden="true" />
            <div>
              <strong>Nur lokal</strong>
              <small>Schema v4 · PR 09</small>
            </div>
          </div>
        </footer>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="context">
            <span>Arbeitsbestand</span>
            <strong>Noch kein Objekt gewählt</strong>
          </div>
          <div className="topbar-actions">
            <span className="save-state">
              <i aria-hidden="true" />
              {saveLabel(workspaceState, previewMode)}
            </span>
            <button
              className="button button--quiet"
              type="button"
              disabled
              title="Der sichere Dateiimport folgt im nächsten UI-Meilenstein."
            >
              Daten importieren
            </button>
          </div>
        </header>

        <main id="main-content" className="main-content">
          <header className="page-heading">
            <div>
              <p className="eyebrow">{route.eyebrow}</p>
              <h1>{route.title}</h1>
              <p>{route.description}</p>
            </div>
            <span className="status-pill status-pill--draft">Entwurf</span>
          </header>

          {route.path === '/' ? (
            <Dashboard
              onCreateWorkspace={onCreateWorkspace}
              workspaceState={workspaceState}
            />
          ) : (
            <EmptyWorkspace
              actionLabel={route.actionLabel}
              section={route.label}
            />
          )}
        </main>
      </div>
    </div>
  )
}
