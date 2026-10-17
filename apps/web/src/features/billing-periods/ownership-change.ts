import {
  ownershipChangeSchema,
  type AppDataFile,
  type OwnershipChange,
} from '@nebenkosten/schema'

/**
 * Eigentümerwechsel im Abrechnungsjahr erfassen (PR-30 Teil 2). Beim Setzen
 * werden Lieferungen und Belege mit Datum vor dem Übergabetag als
 * „vom Voreigentümer“ gekennzeichnet, sofern ihre Herkunft noch nicht
 * erfasst ist; vorhandene Kennzeichen bleiben unverändert.
 */
export class OwnershipChangeError extends Error {}

export interface OwnershipChangeResult {
  readonly data: AppDataFile
  /** Anzahl neu als „vom Voreigentümer“ gekennzeichneter Einträge. */
  readonly marked: number
}

export function applyOwnershipChange(
  data: AppDataFile,
  billingPeriodId: string,
  input: OwnershipChange | null,
): OwnershipChangeResult {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    throw new OwnershipChangeError(
      'Das ausgewählte Abrechnungsjahr ist nicht vorhanden.',
    )
  if (input === null) {
    if (!period.ownershipChange) return { data, marked: 0 }
    return {
      marked: 0,
      data: {
        ...data,
        billingData: {
          ...data.billingData,
          billingPeriods: data.billingData.billingPeriods.map((item) => {
            if (item.id !== billingPeriodId) return item
            const rest = { ...item }
            delete rest.ownershipChange
            return rest
          }),
        },
      },
    }
  }
  const parsed = ownershipChangeSchema.safeParse(input)
  if (!parsed.success)
    throw new OwnershipChangeError('Bitte einen gültigen Übergabetag angeben.')
  const change = parsed.data
  if (
    change.transferDate <= period.periodStart ||
    change.transferDate > period.periodEnd
  )
    throw new OwnershipChangeError(
      'Der Übergabetag muss nach dem Beginn und spätestens am Ende des Abrechnungszeitraums liegen.',
    )

  const categories = new Set(
    data.billingData.costCategories
      .filter((category) => category.billingPeriodId === billingPeriodId)
      .map(({ id }) => id),
  )
  let marked = 0
  const before = (date: string | null | undefined) =>
    date != null && date < change.transferDate
  const fuelDeliveries = data.billingData.fuelDeliveries.map((delivery) => {
    if (
      delivery.billingPeriodId !== billingPeriodId ||
      delivery.origin != null ||
      !before(delivery.date)
    )
      return delivery
    marked += 1
    return { ...delivery, origin: 'previous_owner' as const }
  })
  const costEntries = data.billingData.costEntries.map((entry) => {
    if (
      !categories.has(entry.costCategoryId) ||
      entry.origin != null ||
      !before(entry.date)
    )
      return entry
    marked += 1
    return { ...entry, origin: 'previous_owner' as const }
  })
  return {
    marked,
    data: {
      ...data,
      billingData: {
        ...data.billingData,
        billingPeriods: data.billingData.billingPeriods.map((item) =>
          item.id === billingPeriodId
            ? { ...item, ownershipChange: change }
            : item,
        ),
        fuelDeliveries,
        costEntries,
      },
    },
  }
}

/** Formularfelder des Abschnitts „Eigentümerwechsel“ lesen. */
export function readOwnershipChangeForm(
  form: FormData,
): { ok: true; value: OwnershipChange | null } | { ok: false; error: string } {
  if (!form.has('ownershipChangeActive')) return { ok: true, value: null }
  const transferDate = String(form.get('ownershipTransferDate') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(transferDate))
    return { ok: false, error: 'Bitte den Übergabetag angeben.' }
  const label = String(form.get('ownershipPreviousOwner') ?? '').trim()
  return {
    ok: true,
    value: {
      transferDate,
      ...(label ? { previousOwnerLabel: label } : {}),
    },
  }
}
