import {
  appDataFileSchema,
  uuidSchema,
  type AppDataFile,
} from '@nebenkosten/schema'

export interface CommandDependencies {
  readonly createId: () => string
}

export function defaultCommandDependencies(): CommandDependencies {
  return { createId: () => crypto.randomUUID() }
}

export function assertValidSource(
  data: AppDataFile,
  ErrorType: new (message: string) => Error,
): void {
  if (!appDataFileSchema.safeParse(data).success) {
    throw new ErrorType(
      'Der vorhandene Datenbestand ist ungültig und darf nicht verändert werden.',
    )
  }
}

export function assertValidResult(
  data: AppDataFile,
  ErrorType: new (message: string) => Error,
): AppDataFile {
  if (!appDataFileSchema.safeParse(data).success) {
    throw new ErrorType('Der neue Datenstand entspricht nicht dem Dateischema.')
  }
  return data
}

function entityIdsFromContainer(
  container: Record<string, readonly unknown[]>,
): readonly string[] {
  return Object.values(container).flatMap((entities) =>
    entities.flatMap((entity) => {
      if (
        typeof entity !== 'object' ||
        entity === null ||
        !('id' in entity) ||
        typeof entity.id !== 'string'
      ) {
        return []
      }
      return [entity.id]
    }),
  )
}

function allEntityIds(data: AppDataFile): ReadonlySet<string> {
  return new Set([
    ...entityIdsFromContainer(data.masterData),
    ...entityIdsFromContainer(data.billingData),
  ])
}

export function reserveNewIds(
  data: AppDataFile,
  count: number,
  createId: () => string,
  ErrorType: new (message: string) => Error,
): readonly string[] {
  interface ReservationState {
    readonly ids: readonly string[]
    readonly used: ReadonlySet<string>
  }
  const initial: ReservationState = {
    ids: [],
    used: allEntityIds(data),
  }

  return Array.from({ length: count }).reduce<ReservationState>((state) => {
    const id = createId()
    if (!uuidSchema.safeParse(id).success) {
      throw new ErrorType('Eine neu erzeugte ID muss eine gültige UUID sein.')
    }
    if (state.used.has(id)) {
      throw new ErrorType(`Die neu erzeugte ID "${id}" wird bereits verwendet.`)
    }
    return {
      ids: [...state.ids, id],
      used: new Set([...state.used, id]),
    }
  }, initial).ids
}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} darf nicht leer sein.`)
  }
  const normalized = value.trim()
  if (normalized.length > 500) {
    throw new Error(`${label} darf höchstens 500 Zeichen lang sein.`)
  }
  return normalized
}

export function optionalText(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new Error(`${label} muss Text sein.`)
  }
  const normalized = value.trim()
  if (normalized.length === 0) return undefined
  if (normalized.length > 500) {
    throw new Error(`${label} darf höchstens 500 Zeichen lang sein.`)
  }
  return normalized
}
