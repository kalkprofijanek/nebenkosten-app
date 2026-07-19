type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { readonly [key: string]: JsonValue }

function sortedJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value !== 'object') {
    return value as null | string | number | boolean
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortedJsonValue(entry))
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        sortedJsonValue((value as Record<string, unknown>)[key]),
      ]),
  )
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortedJsonValue(value), null, 2)}\n`
}
