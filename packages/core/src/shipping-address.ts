interface AddressLike {
  readonly street?: string | null
  readonly postalCodeAndCity?: string | null
}

interface LegacyEntryLike {
  readonly path: readonly (number | string)[]
  readonly value: unknown
}

export interface ShippingAddressInput {
  readonly tenancy:
    | {
        readonly shippingAddressStreet?: string | null
        readonly shippingAddressPostalCodeAndCity?: string | null
      }
    | null
    | undefined
  readonly occupancy: {
    readonly kind: string
    readonly to?: string | null
    readonly legacyUnmapped?: readonly LegacyEntryLike[] | null
  }
  readonly property: { readonly address?: AddressLike | null }
  readonly billingPeriod: { readonly periodEnd: string }
}

export interface ResolvedShippingAddress {
  readonly street: string
  readonly postalCodeAndCity: string
  /** `tenancy`: erfasst; `unit`: Hausanschrift der Wohnung; `property`: Objektanschrift. */
  readonly source: 'tenancy' | 'unit' | 'property'
  /** Ohne erfasste Anschrift nach Auszug: Abrechnung geht an die bisherige Anschrift. */
  readonly movedOut?: boolean
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function legacyValue(
  occupancy: ShippingAddressInput['occupancy'],
  key: string,
): string | undefined {
  const entry = occupancy.legacyUnmapped?.find(
    ({ path }) => path.length === 1 && path[0] === key,
  )
  return (
    text(entry?.value) ??
    (typeof entry?.value === 'number' ? String(entry.value) : undefined)
  )
}

/**
 * Versandanschrift einer Nutzung. Eine erfasste Anschrift hat Vorrang. Ohne
 * sie gilt die Hausanschrift der Wohnung (Legacy Straße/Hausnummer) bzw. die
 * Objektstraße mit PLZ/Ort des Objekts – auch nach einem Auszug, weil eine neue
 * Anschrift nicht immer bekannt ist (`movedOut` kennzeichnet diesen Fall).
 */
export function resolveShippingAddress(
  input: ShippingAddressInput,
): ResolvedShippingAddress | null {
  const street = text(input.tenancy?.shippingAddressStreet)
  const city = text(input.tenancy?.shippingAddressPostalCodeAndCity)
  if (street && city)
    return { street, postalCodeAndCity: city, source: 'tenancy' }
  const { occupancy, billingPeriod } = input
  const movedOut =
    !!text(occupancy.to) && occupancy.to! < billingPeriod.periodEnd
  const propertyCity = text(input.property.address?.postalCodeAndCity)
  if (occupancy.kind !== 'tenant' || !propertyCity) return null
  const unitStreet = legacyValue(occupancy, 'strasse')
  if (unitStreet) {
    const houseNumber = legacyValue(occupancy, 'hausnummer')
    return {
      street: houseNumber ? `${unitStreet} ${houseNumber}` : unitStreet,
      postalCodeAndCity: propertyCity,
      source: 'unit',
      movedOut,
    }
  }
  const propertyStreet = text(input.property.address?.street)
  return propertyStreet
    ? {
        street: propertyStreet,
        postalCodeAndCity: propertyCity,
        source: 'property',
        movedOut,
      }
    : null
}
