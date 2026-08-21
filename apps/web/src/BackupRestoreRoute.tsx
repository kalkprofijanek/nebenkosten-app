import { toPersistenceError, type SnapshotMeta } from '@nebenkosten/persistence'
import type { AppDataFile } from '@nebenkosten/schema'
import { useCallback, useEffect, useState } from 'react'

import type {
  WorkspaceCommandErrorCode,
  WorkspaceController,
} from './app/workspace-controller'
import {
  createCanonicalBackup,
  downloadCanonicalBackup,
  type CanonicalBackup,
} from './features/backup/canonical-backup'

interface BackupRestoreRouteProps {
  readonly controller: WorkspaceController
  readonly data: AppDataFile
  readonly now?: () => Date
  readonly onDownload?: (backup: CanonicalBackup) => void
  readonly previewMode?: boolean
}

const SNAPSHOT_KIND_LABELS = {
  automatic: 'Automatisch',
  manual: 'Manuell',
  before_import: 'Vor Import',
  before_restore: 'Vor Wiederherstellung',
} as const

function snapshotFailure(code: WorkspaceCommandErrorCode): string {
  return `Sicherungsaktion nicht möglich (${code}).`
}

export function BackupRestoreRoute({
  controller,
  data,
  now = () => new Date(),
  onDownload = downloadCanonicalBackup,
  previewMode = false,
}: BackupRestoreRouteProps) {
  const [snapshots, setSnapshots] = useState<readonly SnapshotMeta[]>([])
  const [backup, setBackup] = useState<CanonicalBackup | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<SnapshotMeta | null>(null)
  const [beforeRestoreProof, setBeforeRestoreProof] =
    useState<SnapshotMeta | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshSnapshots = useCallback(async () => {
    if (previewMode) return
    const result = await controller.listSnapshots()
    if (!result.ok) {
      setError(
        `Sicherungsstände konnten nicht geladen werden (${result.code}).`,
      )
      return
    }
    setSnapshots(result.value)
  }, [controller, previewMode])

  useEffect(() => {
    if (previewMode) return
    let active = true
    void controller.listSnapshots().then((result) => {
      if (!active) return
      if (!result.ok) {
        setError(
          `Sicherungsstände konnten nicht geladen werden (${result.code}).`,
        )
        return
      }
      setSnapshots(result.value)
    })
    return () => {
      active = false
    }
  }, [controller, previewMode])

  const workspaceState = controller.getState()
  const backupDisabled =
    busy ||
    workspaceState.status !== 'ready' ||
    workspaceState.dirty ||
    workspaceState.saving
  const snapshotsDisabled =
    previewMode ||
    busy ||
    workspaceState.status !== 'ready' ||
    workspaceState.revision === null ||
    workspaceState.dirty ||
    workspaceState.saving

  return (
    <div className="backup-layout">
      {previewMode ? (
        <aside className="backup-preview-note">
          <strong>Keine dauerhafte Snapshot-Sicherung</strong>
          <p>
            Vorschaumodus: Snapshots wären nur im Arbeitsspeicher und beim
            Neuladen verloren.
          </p>
        </aside>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}

      <section className="backup-card" aria-labelledby="json-backup-title">
        <div>
          <p className="section-kicker">Portables Backup</p>
          <h2 id="json-backup-title">Kanonische JSON-Sicherung</h2>
          <p>
            Erstellt eine vollständige Schema-v4-Datei mit lokal prüfbarer
            SHA-256-Prüfsumme.
          </p>
          <p className="backup-confidentiality-note">
            Vertraulich: Die Datei enthält sämtliche Personen-, Adress-, Bank-
            und Abrechnungsdaten. Nur verschlüsselt oder an einem geschützten
            Ort speichern.
          </p>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={backupDisabled}
          title={
            backupDisabled && !busy
              ? 'Backup erst nach erfolgreicher lokaler Speicherung möglich.'
              : undefined
          }
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              const prepared = await createCanonicalBackup(data, {
                createdAt: now(),
              })
              onDownload(prepared)
              setBackup(prepared)
            } catch (caught: unknown) {
              setError(
                `JSON-Sicherung konnte nicht erstellt werden (${
                  toPersistenceError(caught).code
                }).`,
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          JSON-Sicherung herunterladen
        </button>
        {backup ? (
          <dl className="backup-metadata" aria-label="Backup-Nachweis">
            <div>
              <dt>Erstellt</dt>
              <dd>{backup.createdAt}</dd>
            </div>
            <div>
              <dt>Dateigröße</dt>
              <dd>{backup.byteLength} Bytes</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd>{backup.sha256}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="backup-card" aria-labelledby="snapshot-title">
        <div className="backup-card__heading">
          <div>
            <p className="section-kicker">Lokale Historie</p>
            <h2 id="snapshot-title">Sicherungsstände</h2>
          </div>
          <button
            className="button button--quiet"
            type="button"
            disabled={snapshotsDisabled}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const result = await controller.createManualSnapshot()
              if (!result.ok) setError(snapshotFailure(result.code))
              await refreshSnapshots()
              setBusy(false)
            }}
          >
            Manuellen Snapshot anlegen
          </button>
        </div>

        {snapshots.length === 0 ? (
          <p>Keine Sicherungsstände vorhanden.</p>
        ) : (
          <ul className="snapshot-list">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>{SNAPSHOT_KIND_LABELS[snapshot.kind]}</strong>
                  <small>{snapshot.createdAt}</small>
                  <span>
                    {snapshot.byteLength} Bytes · SHA-256 {snapshot.sha256}
                  </span>
                </div>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={snapshotsDisabled}
                  onClick={() => {
                    setError(null)
                    setRestoreTarget(snapshot)
                  }}
                >
                  Diesen Stand wiederherstellen
                </button>
              </li>
            ))}
          </ul>
        )}

        {beforeRestoreProof ? (
          <aside className="restore-proof">
            <strong>Sicherung vor Wiederherstellung nachgewiesen</strong>
            <p>
              before_restore · {beforeRestoreProof.createdAt} · SHA-256{' '}
              {beforeRestoreProof.sha256}
            </p>
          </aside>
        ) : null}
      </section>

      {restoreTarget ? (
        <div className="dialog-backdrop">
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-confirm-title"
          >
            <h2 id="restore-confirm-title">Wiederherstellung bestätigen</h2>
            <p>
              Der aktuelle Arbeitsstand wird ersetzt. Der Adapter legt vorher
              atomar einen angehefteten before_restore-Snapshot an.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                autoFocus
                onClick={() => setRestoreTarget(null)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  const result = await controller.restoreSnapshot(
                    restoreTarget.id,
                    true,
                  )
                  if (result.ok) {
                    setBeforeRestoreProof(result.value.beforeRestoreSnapshot)
                    setRestoreTarget(null)
                    await refreshSnapshots()
                  } else {
                    setError(snapshotFailure(result.code))
                  }
                  setBusy(false)
                }}
              >
                Verbindlich wiederherstellen
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
