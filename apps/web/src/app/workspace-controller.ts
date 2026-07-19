import {
  toPersistenceError,
  type PersistenceErrorCode,
  type StorageAdapter,
} from '@nebenkosten/persistence'
import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'

export type WorkspaceStatus =
  'loading' | 'empty' | 'ready' | 'conflict' | 'blocked' | 'error'

export interface WorkspaceState {
  readonly status: WorkspaceStatus
  readonly data: AppDataFile | null
  readonly revision: string | null
  readonly dirty: boolean
  readonly saving: boolean
  readonly errorCode: PersistenceErrorCode | null
}

export interface WorkspaceControllerOptions {
  readonly adapter: StorageAdapter
  readonly debounceMs?: number
}

export interface WorkspaceController {
  getState(): WorkspaceState
  load(): Promise<void>
  createNew(): boolean
  update(transform: (draft: AppDataFile) => AppDataFile): boolean
  reportExternalRevision(revision: string): void
  retrySave(): boolean
  shouldWarnBeforeUnload(): boolean
  subscribe(listener: (state: WorkspaceState) => void): () => void
  dispose(): void
}

const BLOCKING_CODES = new Set<PersistenceErrorCode>([
  'corrupt_storage',
  'hash_failed',
  'invalid_data',
  'invalid_json',
  'invalid_utf8',
  'newer_schema_version',
  'unsupported_schema_version',
])

function initialState(): WorkspaceState {
  return {
    status: 'loading',
    data: null,
    revision: null,
    dirty: false,
    saving: false,
    errorCode: null,
  }
}

function cloneData(data: AppDataFile): AppDataFile {
  return structuredClone(data)
}

export function createWorkspaceController({
  adapter,
  debounceMs = 500,
}: WorkspaceControllerOptions): WorkspaceController {
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new RangeError('debounceMs must be a finite non-negative number')
  }

  let state = initialState()
  let disposed = false
  let loadStarted = false
  let changeGeneration = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let saveInFlight = false
  const listeners = new Set<(nextState: WorkspaceState) => void>()

  const publish = (nextState: WorkspaceState): void => {
    if (disposed) return
    state = nextState
    for (const listener of listeners) listener(state)
  }

  const clearTimer = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const classifyFailure = (
    error: unknown,
    retainedData: AppDataFile | null,
    revision: string | null,
    dirty: boolean,
  ): WorkspaceState => {
    const persistenceError = toPersistenceError(error)
    const status =
      persistenceError.code === 'conflict'
        ? 'conflict'
        : BLOCKING_CODES.has(persistenceError.code)
          ? 'blocked'
          : 'error'
    return {
      status,
      data: retainedData,
      revision,
      dirty,
      saving: false,
      errorCode: persistenceError.code,
    }
  }

  const scheduleAutosave = (): void => {
    if (disposed || saveInFlight || state.status !== 'ready' || !state.dirty) {
      return
    }
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void flushAutosave()
    }, debounceMs)
  }

  async function flushAutosave(): Promise<void> {
    if (
      disposed ||
      saveInFlight ||
      state.status !== 'ready' ||
      !state.dirty ||
      state.data === null
    ) {
      return
    }

    const dataToSave = cloneData(state.data)
    const expectedRevision = state.revision
    const savedGeneration = changeGeneration
    saveInFlight = true
    publish({ ...state, saving: true })

    try {
      const result = await adapter.save(dataToSave, { expectedRevision })
      if (disposed) return

      saveInFlight = false
      const postSaveState = state as WorkspaceState
      if (postSaveState.status === 'conflict') {
        publish({ ...postSaveState, saving: false })
        return
      }
      const changedDuringSave = changeGeneration !== savedGeneration
      publish({
        ...state,
        status: 'ready',
        revision: result.revision,
        dirty: changedDuringSave,
        saving: false,
        errorCode: null,
      })
      if (changedDuringSave) scheduleAutosave()
    } catch (error: unknown) {
      if (disposed) return

      saveInFlight = false
      clearTimer()
      publish(classifyFailure(error, state.data, expectedRevision, true))
    }
  }

  return {
    getState(): WorkspaceState {
      return state
    },

    async load(): Promise<void> {
      if (disposed || loadStarted) return
      loadStarted = true

      try {
        const loaded = await adapter.load()
        if (disposed) return

        if (loaded === null) {
          publish({
            status: 'empty',
            data: null,
            revision: null,
            dirty: false,
            saving: false,
            errorCode: null,
          })
          return
        }

        publish({
          status: 'ready',
          data: cloneData(loaded.data),
          revision: loaded.revision,
          dirty: false,
          saving: false,
          errorCode: null,
        })
      } catch (error: unknown) {
        if (disposed) return
        publish(classifyFailure(error, null, null, false))
      }
    },

    createNew(): boolean {
      if (disposed || state.status !== 'empty') return false

      changeGeneration += 1
      publish({
        status: 'ready',
        data: createEmptyAppDataFile(),
        revision: null,
        dirty: true,
        saving: false,
        errorCode: null,
      })
      scheduleAutosave()
      return true
    },

    update(transform: (draft: AppDataFile) => AppDataFile): boolean {
      if (disposed || state.status !== 'ready' || state.data === null) {
        return false
      }

      const transformed = transform(cloneData(state.data))
      const validated = appDataFileSchema.parse(transformed)
      changeGeneration += 1
      publish({
        ...state,
        data: validated,
        dirty: true,
        errorCode: null,
      })
      scheduleAutosave()
      return true
    },

    reportExternalRevision(revision: string): void {
      if (disposed || state.status !== 'ready' || state.revision === revision) {
        return
      }
      clearTimer()
      publish({
        ...state,
        status: 'conflict',
        saving: false,
        errorCode: 'conflict',
      })
    },

    retrySave(): boolean {
      if (
        disposed ||
        state.status !== 'error' ||
        state.data === null ||
        !state.dirty
      ) {
        return false
      }
      publish({ ...state, status: 'ready', errorCode: null })
      scheduleAutosave()
      return true
    },

    shouldWarnBeforeUnload(): boolean {
      return state.dirty || state.saving || state.status === 'conflict'
    },

    subscribe(listener: (nextState: WorkspaceState) => void): () => void {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      clearTimer()
      listeners.clear()
    },
  }
}
