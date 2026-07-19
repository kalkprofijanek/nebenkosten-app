import { CurrentAppDataCodecError } from './errors'

const isJsonPrimitive = (
  value: unknown,
): value is null | string | number | boolean =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'

function rejectUnsafe(): never {
  throw new CurrentAppDataCodecError('not_json_safe')
}

function assertSafePrimitive(value: null | string | number | boolean): void {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Object.is(value, -0))
  ) {
    rejectUnsafe()
  }
}

function assertSafeOwnProperties(
  value: object,
  activeObjects: WeakSet<object>,
): void {
  if (activeObjects.has(value)) {
    rejectUnsafe()
  }

  activeObjects.add(value)
  try {
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      rejectUnsafe()
    }

    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === 'length') {
        continue
      }
      if (
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        rejectUnsafe()
      }
      assertJsonSafeValue(descriptor.value, activeObjects)
    }
  } finally {
    activeObjects.delete(value)
  }
}

function assertJsonSafeValue(
  value: unknown,
  activeObjects: WeakSet<object>,
): void {
  if (isJsonPrimitive(value)) {
    assertSafePrimitive(value)
    return
  }

  if (typeof value !== 'object' || value === null) {
    rejectUnsafe()
  }

  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.keys(value).length !== value.length
    ) {
      rejectUnsafe()
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        rejectUnsafe()
      }
    }
  } else if (Object.getPrototypeOf(value) !== Object.prototype) {
    rejectUnsafe()
  }

  assertSafeOwnProperties(value, activeObjects)
}

export function assertJsonSafe(value: unknown): void {
  assertJsonSafeValue(value, new WeakSet<object>())
}
