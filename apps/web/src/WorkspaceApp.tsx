import {
  IndexedDbStorageAdapter,
  MemoryStorageAdapter,
} from '@nebenkosten/persistence'
import { useEffect, useMemo, useRef, useState } from 'react'

import { App } from './App'
import { AnnualBillingRoute } from './AnnualBillingRoute'
import { BackupRestoreRoute } from './BackupRestoreRoute'
import { CalculationRoute } from './CalculationRoute'
import { ImportControl } from './ImportControl'
import { MigrationPanel } from './MigrationPanel'
import { PdfExportRoute } from './PdfExportRoute'
import { PrepaymentsRoute } from './features/prepayments/PrepaymentsRoute'
import { RentLedgerRoute } from './features/rent-ledger/RentLedgerRoute'
import { ConsumptionRoute } from './features/consumption/ConsumptionRoute'
import { ReleaseRoute } from './ReleaseRoute'
import { WorkflowRoute } from './WorkflowRoute'
import {
  emptySelection,
  normalizeSelection,
  type SelectionContext,
} from './app/selection'
import { TabCoordinator } from './app/tab-coordination'
import {
  createWorkspaceController,
  type WorkspaceController,
  type WorkspaceState,
} from './app/workspace-controller'
import { applyEditableBillingPeriodChange } from './features/release/edit-guard'

interface WorkspaceAppProps {
  readonly controller?: WorkspaceController
}

function createBrowserController(): WorkspaceController {
  const adapter =
    globalThis.location.protocol === 'file:'
      ? new MemoryStorageAdapter()
      : new IndexedDbStorageAdapter({
          databaseName: 'nebenkosten-app-v4',
        })
  return createWorkspaceController({ adapter, debounceMs: 800 })
}

export function WorkspaceApp({
  controller: providedController,
}: WorkspaceAppProps) {
  const previewMode = globalThis.location.protocol === 'file:'
  const [controller] = useState(
    () => providedController ?? createBrowserController(),
  )
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(
    controller.getState(),
  )
  const [selection, setSelection] = useState<SelectionContext>(emptySelection)
  const normalizedSelection = useMemo(
    () =>
      workspaceState.data === null
        ? emptySelection
        : normalizeSelection(workspaceState.data, selection),
    [selection, workspaceState.data],
  )
  const announcedRevision = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = controller.subscribe(setWorkspaceState)
    void controller.load().then(() => {
      if (
        globalThis.location.protocol === 'file:' &&
        controller.getState().status === 'empty'
      ) {
        controller.createNew()
      }
    })
    return () => {
      unsubscribe()
    }
  }, [controller, providedController])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.shouldWarnBeforeUnload()) return
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', handleBeforeUnload)
    return () =>
      globalThis.removeEventListener('beforeunload', handleBeforeUnload)
  }, [controller])

  useEffect(() => {
    if (
      providedController !== undefined ||
      globalThis.location.protocol === 'file:' ||
      !('BroadcastChannel' in globalThis)
    ) {
      return
    }

    const coordinator = new TabCoordinator(
      new BroadcastChannel('nebenkosten-app-workspace-v4'),
      globalThis.crypto.randomUUID(),
      (revision) => controller.reportExternalRevision(revision),
    )
    coordinator.start()
    const unsubscribe = controller.subscribe((state) => {
      if (
        state.revision !== null &&
        state.revision !== announcedRevision.current
      ) {
        announcedRevision.current = state.revision
        coordinator.announce(state.revision)
      }
    })
    return () => {
      unsubscribe()
      coordinator.dispose()
    }
  }, [controller, providedController])

  return (
    <App
      previewMode={previewMode}
      workspaceControl={
        workspaceState.status === 'migration_pending' ? (
          <MigrationPanel
            key={workspaceState.revision}
            controller={controller}
            state={workspaceState}
          />
        ) : undefined
      }
      importControl={
        previewMode ? undefined : (
          <ImportControl
            disabled={
              workspaceState.saving ||
              workspaceState.dirty ||
              (workspaceState.status !== 'ready' &&
                workspaceState.status !== 'empty')
            }
            onConfirm={(data) => controller.importData(data)}
          />
        )
      }
      workspaceState={workspaceState}
      selection={normalizedSelection}
      onSelectionChange={(patch) =>
        setSelection((current) => ({ ...current, ...patch }))
      }
      renderRoute={
        workspaceState.data === null
          ? undefined
          : (path) =>
              path === '/jahresabrechnung' ? (
                <AnnualBillingRoute
                  data={workspaceState.data!}
                  selection={normalizedSelection}
                  onApply={(transform) => controller.update(transform)}
                  onSelectionChange={(patch) =>
                    setSelection((current) => ({ ...current, ...patch }))
                  }
                />
              ) : path === '/freigabe' ? (
                <ReleaseRoute
                  data={workspaceState.data!}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) => controller.update(transform)}
                />
              ) : path === '/sicherung' ? (
                <BackupRestoreRoute
                  controller={controller}
                  data={workspaceState.data!}
                  previewMode={previewMode}
                />
              ) : path === '/pdf-export' ? (
                <PdfExportRoute
                  data={workspaceState.data!}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) => controller.update(transform)}
                />
              ) : path === '/verbrauch' ? (
                <ConsumptionRoute
                  data={workspaceState.data!}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) => controller.update(transform)}
                />
              ) : path === '/vorauszahlungen' ? (
                <PrepaymentsRoute
                  data={workspaceState.data!}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) => controller.update(transform)}
                />
              ) : path === '/mietkonto' ? (
                <RentLedgerRoute
                  data={workspaceState.data!}
                  propertyId={normalizedSelection.propertyId}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) => controller.update(transform)}
                />
              ) : path === '/berechnung' ? (
                <CalculationRoute
                  data={workspaceState.data!}
                  billingPeriodId={normalizedSelection.billingPeriodId}
                  onApply={(transform) =>
                    controller.update((current) =>
                      normalizedSelection.billingPeriodId === null
                        ? transform(current)
                        : applyEditableBillingPeriodChange(
                            current,
                            normalizedSelection.billingPeriodId,
                            transform,
                          ),
                    )
                  }
                />
              ) : (
                <WorkflowRoute
                  path={path}
                  data={workspaceState.data!}
                  selection={normalizedSelection}
                  onApply={(transform) =>
                    controller.update((current) =>
                      normalizedSelection.billingPeriodId === null
                        ? transform(current)
                        : applyEditableBillingPeriodChange(
                            current,
                            normalizedSelection.billingPeriodId,
                            transform,
                          ),
                    )
                  }
                  onSelectionChange={(patch) =>
                    setSelection((current) => ({ ...current, ...patch }))
                  }
                />
              )
      }
      onCreateWorkspace={previewMode ? undefined : () => controller.createNew()}
    />
  )
}
