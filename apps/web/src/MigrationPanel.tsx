import { useState } from 'react'

import type {
  WorkspaceController,
  WorkspaceState,
} from './app/workspace-controller'

export function MigrationPanel({
  controller,
  state,
}: {
  readonly controller: WorkspaceController
  readonly state: WorkspaceState
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <section className="workflow-panel" aria-labelledby="migration-title">
      <h2 id="migration-title">Datenbestand auf Version 5 umstellen</h2>
      <p>
        Dein bisheriger Stand wird vor der Umstellung vollständig gesichert.
        Bestehende Abrechnungen und manuelle Verbrauchswerte bleiben erhalten.
        Die neue Berechnung aus Zählerständen wird erst nach einer gesonderten
        Zuordnung und Aktivierung verwendet.
      </p>
      <p>Bis zur Umstellung bleibt dieser Bestand schreibgeschützt.</p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={state.saving}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Ich bestätige die Umstellung auf Version 5 mit Sicherung des bisherigen
        Stands.
      </label>
      {state.errorCode ? (
        <p role="alert">
          Die Umstellung konnte nicht abgeschlossen werden ({state.errorCode}).
          Prüfe den verfügbaren Speicher und versuche es erneut.
        </p>
      ) : null}
      <button
        className="button button--primary"
        type="button"
        disabled={!confirmed || state.saving}
        onClick={() => void controller.migrateStoredData(confirmed)}
      >
        {state.saving
          ? 'Sicherung und Umstellung läuft …'
          : 'Sichern und umstellen'}
      </button>
    </section>
  )
}
