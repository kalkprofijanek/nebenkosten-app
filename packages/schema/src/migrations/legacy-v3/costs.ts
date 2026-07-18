import type { LegacyUnmappedEntry, V3Beleg, V3Kostenart } from '../..'
import { fileAttachmentSchema } from '../../entities/shared'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import {
  mapAllocationKey,
  mapCostKind,
  mapScope,
  requiredString,
} from './mapping'
import type { PropertyContext } from './shared'
import { stringOrNullish, withLegacy } from './shared'
import type { MigrationState } from './state'
import { addUnmapped, preserveUnknownKeys } from './unknown-fields'
import {
  optionalBoolean,
  optionalCents,
  optionalDate,
  optionalPercent,
} from './values'

function mapAttachment(
  context: MigrationContext,
  receipt: V3Beleg,
  path: JsonPath,
  legacy: LegacyUnmappedEntry[],
) {
  if (
    receipt.datei_data == null &&
    receipt.datei_name == null &&
    receipt.datei_typ == null
  )
    return undefined
  const candidate = {
    fileName: receipt.datei_name,
    mimeType: receipt.datei_typ,
    dataBase64: receipt.datei_data,
  }
  const parsed = fileAttachmentSchema.safeParse(candidate)
  if (parsed.success) {
    const payload = parsed.data.dataBase64.split(',')[1]!
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const decoded: number[] = []
    for (let index = 0; index < Math.min(payload.length, 24); index += 4) {
      const values = payload
        .slice(index, index + 4)
        .split('')
        .map((character) => alphabet.indexOf(character))
      const bits =
        ((values[0] ?? 0) << 18) |
        ((values[1] ?? 0) << 12) |
        ((Math.max(values[2] ?? 0, 0) & 63) << 6) |
        (Math.max(values[3] ?? 0, 0) & 63)
      decoded.push((bits >> 16) & 255)
      if (payload[index + 2] !== '=') decoded.push((bits >> 8) & 255)
      if (payload[index + 3] !== '=') decoded.push(bits & 255)
    }
    const startsWith = (signature: number[]) =>
      signature.every((byte, index) => decoded[index] === byte)
    const matchesMagic =
      (parsed.data.mimeType === 'application/pdf' &&
        startsWith([0x25, 0x50, 0x44, 0x46])) ||
      (parsed.data.mimeType === 'image/jpeg' &&
        startsWith([0xff, 0xd8, 0xff])) ||
      (parsed.data.mimeType === 'image/png' &&
        startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      (parsed.data.mimeType === 'image/webp' &&
        startsWith([0x52, 0x49, 0x46, 0x46]) &&
        decoded
          .slice(8, 12)
          .every((byte, index) => byte === [0x57, 0x45, 0x42, 0x50][index]))
    if (matchesMagic) return parsed.data
    context.issue(
      'warning',
      'migration.attachment_signature_mismatch',
      'Die Dateisignatur eines Anhangs passt nicht zum MIME-Typ',
      [...path, 'datei_data'],
    )
  }
  context.issue(
    'warning',
    'migration.invalid_attachment',
    'Ein ungültiger Dateianhang wurde nur konserviert',
    [...path, 'datei_data'],
  )
  for (const key of ['datei_name', 'datei_typ', 'datei_data'] as const)
    if (receipt[key] !== undefined)
      addUnmapped(context, legacy, [key], [...path, key], receipt[key])
  return undefined
}

export function mapCost(
  state: MigrationState,
  context: MigrationContext,
  cost: V3Kostenart,
  path: JsonPath,
  billingPeriodId: string,
  property: PropertyContext,
): void {
  const legacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    cost,
    [
      'id',
      'standard_key',
      'typ',
      'bezeichnung',
      'kostentext',
      'betrKV_kat',
      'umlage_nach',
      'betrag',
      'datum',
      'scope_key',
      'rechnungen',
      'betriebsstrom_abzug',
      'abrechnung_ausblenden',
      'umlage_proz',
      'lohn_anteil_proz',
      'aus_grundsteuer_import',
      'grundsteuermessbetrag_eur',
    ],
    legacy,
    path,
  )
  const label = requiredString(
    context,
    cost.bezeichnung,
    [...path, 'bezeichnung'],
    'Die Bezeichnung einer Kostenart fehlt',
  )
  if (!label) return
  const costCategoryIndex = state.costCategories.length
  context.change(
    [...path, 'id'],
    ['billingData', 'costCategories', costCategoryIndex, 'id'],
    'verbatim',
  )
  if (cost.typ !== undefined)
    context.change(
      [...path, 'typ'],
      ['billingData', 'costCategories', costCategoryIndex, 'kind'],
      'enum_map',
    )
  if (cost.scope_key !== undefined)
    context.change(
      [...path, 'scope_key'],
      ['billingData', 'costCategories', costCategoryIndex, 'scope'],
      'ref_split',
    )
  if (cost.betrag !== undefined)
    context.change(
      [...path, 'betrag'],
      ['billingData', 'costCategories', costCategoryIndex, 'totalAmountCents'],
      'euro_to_cents',
    )
  if (legacy.length > 0)
    context.change(
      path,
      ['billingData', 'costCategories', costCategoryIndex, 'legacyUnmapped'],
      'preserve_unknown',
    )
  state.costCategories = [
    ...state.costCategories,
    withLegacy(
      {
        id: cost.id,
        billingPeriodId,
        standardKey: stringOrNullish(cost.standard_key),
        kind: mapCostKind(context, cost.typ, [...path, 'typ'], legacy),
        label,
        statementText: stringOrNullish(cost.kostentext),
        betrkvCategory: stringOrNullish(cost.betrKV_kat),
        allocationKey: mapAllocationKey(
          context,
          cost.umlage_nach,
          [...path, 'umlage_nach'],
          legacy,
        ),
        scope: mapScope(cost.scope_key, property.buildingIds),
        totalAmountCents: optionalCents(
          context,
          cost.betrag,
          [...path, 'betrag'],
          ['betrag'],
          legacy,
        ),
        date: optionalDate(
          context,
          cost.datum,
          [...path, 'datum'],
          ['datum'],
          legacy,
        ),
        isOperatingElectricitySource: optionalBoolean(
          context,
          cost.betriebsstrom_abzug,
          [...path, 'betriebsstrom_abzug'],
          ['betriebsstrom_abzug'],
          legacy,
        ),
        hideWhenZero: optionalBoolean(
          context,
          cost.abrechnung_ausblenden,
          [...path, 'abrechnung_ausblenden'],
          ['abrechnung_ausblenden'],
          legacy,
        ),
        allocablePercent: optionalPercent(
          context,
          cost.umlage_proz,
          [...path, 'umlage_proz'],
          ['umlage_proz'],
          legacy,
        ),
        laborSharePercent: optionalPercent(
          context,
          cost.lohn_anteil_proz,
          [...path, 'lohn_anteil_proz'],
          ['lohn_anteil_proz'],
          legacy,
        ),
        fromPropertyTaxImport: optionalBoolean(
          context,
          cost.aus_grundsteuer_import,
          [...path, 'aus_grundsteuer_import'],
          ['aus_grundsteuer_import'],
          legacy,
        ),
        propertyTaxAssessmentCents: optionalCents(
          context,
          cost.grundsteuermessbetrag_eur,
          [...path, 'grundsteuermessbetrag_eur'],
          ['grundsteuermessbetrag_eur'],
          legacy,
        ),
      },
      legacy,
    ),
  ]
  for (const [receiptIndex, receipt] of (cost.rechnungen ?? []).entries()) {
    const receiptPath = [...path, 'rechnungen', receiptIndex]
    const receiptLegacy: LegacyUnmappedEntry[] = []
    preserveUnknownKeys(
      context,
      receipt,
      [
        'datum',
        'bezeichnung',
        'betrag',
        'beleg',
        'datei_data',
        'datei_name',
        'datei_typ',
        'umlage_proz',
        '_buchung',
        '_buchung_split',
        '_extern_ok',
        '_extern_grund',
        '_stromzaehler_id',
        '_geschaetzt',
        '_schaetzung_grund',
      ],
      receiptLegacy,
      receiptPath,
    )
    const amount = optionalCents(
      context,
      receipt.betrag,
      [...receiptPath, 'betrag'],
      ['betrag'],
      receiptLegacy,
    )
    if (typeof amount !== 'number') {
      context.issue(
        'error',
        'migration.required_amount_invalid',
        'Der Betrag eines Belegs fehlt oder ist ungültig',
        [...receiptPath, 'betrag'],
      )
      continue
    }
    const costEntryIndex = state.costEntries.length
    context.change(
      receiptPath,
      ['billingData', 'costEntries', costEntryIndex, 'id'],
      'id_generate',
    )
    context.change(
      [...receiptPath, 'betrag'],
      ['billingData', 'costEntries', costEntryIndex, 'amountCents'],
      'euro_to_cents',
    )
    if (receipt.datum !== undefined)
      context.change(
        [...receiptPath, 'datum'],
        ['billingData', 'costEntries', costEntryIndex, 'date'],
        'date_to_iso',
      )
    if (receipt._buchung !== undefined)
      context.change(
        [...receiptPath, '_buchung'],
        ['billingData', 'costEntries', costEntryIndex, 'bookingLink'],
        'ref_split',
      )
    state.costEntries = [
      ...state.costEntries,
      withLegacy(
        {
          id: context.id([...receiptPath, 'cost_entry']),
          costCategoryId: cost.id,
          date: optionalDate(
            context,
            receipt.datum,
            [...receiptPath, 'datum'],
            ['datum'],
            receiptLegacy,
          ),
          description: stringOrNullish(receipt.bezeichnung),
          amountCents: amount,
          receiptReference: stringOrNullish(receipt.beleg),
          attachment: mapAttachment(
            context,
            receipt,
            receiptPath,
            receiptLegacy,
          ),
          allocablePercent: optionalPercent(
            context,
            receipt.umlage_proz,
            [...receiptPath, 'umlage_proz'],
            ['umlage_proz'],
            receiptLegacy,
          ),
          bookingLink:
            typeof receipt._buchung === 'string' && receipt._buchung.length > 0
              ? {
                  bankBookingId: receipt._buchung,
                  splitId: stringOrNullish(receipt._buchung_split),
                }
              : undefined,
          externalPayment:
            receipt._extern_ok !== undefined ||
            receipt._extern_grund !== undefined
              ? {
                  confirmed:
                    optionalBoolean(
                      context,
                      receipt._extern_ok,
                      [...receiptPath, '_extern_ok'],
                      ['_extern_ok'],
                      receiptLegacy,
                    ) ?? false,
                  reason: stringOrNullish(receipt._extern_grund),
                }
              : undefined,
          meterId: stringOrNullish(receipt._stromzaehler_id),
          estimate:
            receipt._geschaetzt !== undefined ||
            receipt._schaetzung_grund !== undefined
              ? {
                  isEstimated:
                    optionalBoolean(
                      context,
                      receipt._geschaetzt,
                      [...receiptPath, '_geschaetzt'],
                      ['_geschaetzt'],
                      receiptLegacy,
                    ) ?? false,
                  reason: stringOrNullish(receipt._schaetzung_grund),
                }
              : undefined,
        },
        receiptLegacy,
      ),
    ]
  }
}
