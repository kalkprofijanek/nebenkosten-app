import type {
  BankBookingCategory,
  LegacyUnmappedEntry,
  MeterKind,
  V3Abrechnung,
  V3Buchung,
  V3Stromzaehler,
} from '../..'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { requiredString, splitEnergyReference } from './mapping'
import type { PropertyContext } from './shared'
import { stringOrNullish, withLegacy } from './shared'
import type { MigrationState } from './state'
import { addUnmapped, preserveUnknownKeys } from './unknown-fields'
import {
  optionalBoolean,
  optionalCents,
  optionalDate,
  optionalInteger,
  optionalPercent,
  optionalTimestamp,
} from './values'

function mapMeterKind(value: unknown): MeterKind | undefined {
  if (value === 'allgemein') return 'general'
  if (value === 'waerme' || value === 'wärme') return 'heat'
  return undefined
}

export function mapMeters(
  state: MigrationState,
  context: MigrationContext,
  meters: V3Stromzaehler[],
  path: JsonPath,
  property: PropertyContext,
): void {
  for (const [meterIndex, meter] of meters.entries()) {
    const meterPath = [...path, meterIndex]
    const legacy: LegacyUnmappedEntry[] = []
    preserveUnknownKeys(
      context,
      meter,
      [
        'id',
        'adresse',
        'zaehlernummer',
        'malo_id',
        'art',
        'anbieter',
        'vertragsnummer_oder_konto',
        'heizkreis_id',
        'gueltig_von',
        'gueltig_bis',
        'zaehlernummer_status',
        'notiz',
        'zusatz_hinweis',
        'jahresstatus',
      ],
      legacy,
      meterPath,
    )
    const kind = mapMeterKind(meter.art)
    if (!kind) {
      context.issue(
        'error',
        'migration.required_meter_kind_invalid',
        'Die Zählerart fehlt oder ist ungültig',
        [...meterPath, 'art'],
      )
      continue
    }
    const energySourceRef = splitEnergyReference(
      meter.heizkreis_id,
      property.buildingIds,
    )
    if (meter.heizkreis_id && !energySourceRef) {
      context.issue(
        'warning',
        'migration.invalid_energy_reference',
        'Eine Zähler-Heizkreisreferenz wurde nicht übernommen',
        [...meterPath, 'heizkreis_id'],
      )
      addUnmapped(
        context,
        legacy,
        ['heizkreis_id'],
        [...meterPath, 'heizkreis_id'],
        meter.heizkreis_id,
      )
    }
    let meterNumberStatus: 'open' | 'confirmed' | undefined
    if (meter.zaehlernummer_status === 'offen') meterNumberStatus = 'open'
    else if (meter.zaehlernummer_status === 'bestaetigt')
      meterNumberStatus = 'confirmed'
    else if (meter.zaehlernummer_status != null) {
      context.issue(
        'warning',
        'migration.unknown_meter_status',
        'Ein unbekannter Zählerstatus wurde nicht übernommen',
        [...meterPath, 'zaehlernummer_status'],
      )
      addUnmapped(
        context,
        legacy,
        ['zaehlernummer_status'],
        [...meterPath, 'zaehlernummer_status'],
        meter.zaehlernummer_status,
      )
    }
    state.meters = [
      ...state.meters,
      withLegacy(
        {
          id: meter.id,
          propertyId: property.propertyId,
          kind,
          address: stringOrNullish(meter.adresse),
          meterNumber: stringOrNullish(meter.zaehlernummer),
          maloId: stringOrNullish(meter.malo_id),
          provider: stringOrNullish(meter.anbieter),
          contractOrAccountNumber: stringOrNullish(
            meter.vertragsnummer_oder_konto,
          ),
          energySourceRef,
          validFrom: optionalDate(
            context,
            meter.gueltig_von,
            [...meterPath, 'gueltig_von'],
            ['gueltig_von'],
            legacy,
          ),
          validTo: optionalDate(
            context,
            meter.gueltig_bis,
            [...meterPath, 'gueltig_bis'],
            ['gueltig_bis'],
            legacy,
          ),
          meterNumberStatus,
          note: stringOrNullish(meter.notiz),
          additionalNote: stringOrNullish(meter.zusatz_hinweis),
        },
        legacy,
      ),
    ]
    for (const [yearKey, status] of Object.entries(meter.jahresstatus ?? {})) {
      const statusPath = [...meterPath, 'jahresstatus', yearKey]
      const statusLegacy: LegacyUnmappedEntry[] = []
      preserveUnknownKeys(
        context,
        status,
        [
          'buchung_vorhanden',
          'jahresrechnung_vorhanden',
          'notiz',
          'schaetzung_betrag',
          'schaetzung_grund',
        ],
        statusLegacy,
        statusPath,
      )
      const year = Number(yearKey)
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        context.issue(
          'error',
          'migration.invalid_meter_year',
          'Ein Zähler-Jahresstatus hat kein gültiges Jahr',
          statusPath,
        )
        continue
      }
      const billingPeriodId = property.billingPeriodsByYear.get(year)
      if (!billingPeriodId)
        context.issue(
          'warning',
          'migration.meter_year_without_billing_period',
          'Ein Zähler-Jahresstatus hat keine Abrechnungsperiode',
          statusPath,
        )
      state.meterBillingStatuses = [
        ...state.meterBillingStatuses,
        withLegacy(
          {
            id: context.id([...statusPath, 'meter_billing_status']),
            meterId: meter.id,
            billingPeriodId,
            year,
            bookingPresent: optionalBoolean(
              context,
              status.buchung_vorhanden,
              [...statusPath, 'buchung_vorhanden'],
              ['buchung_vorhanden'],
              statusLegacy,
            ),
            annualInvoicePresent: optionalBoolean(
              context,
              status.jahresrechnung_vorhanden,
              [...statusPath, 'jahresrechnung_vorhanden'],
              ['jahresrechnung_vorhanden'],
              statusLegacy,
            ),
            note: stringOrNullish(status.notiz),
            estimateAmountCents: optionalCents(
              context,
              status.schaetzung_betrag,
              [...statusPath, 'schaetzung_betrag'],
              ['schaetzung_betrag'],
              statusLegacy,
            ),
            estimateReason: stringOrNullish(status.schaetzung_grund),
          },
          statusLegacy,
        ),
      ]
    }
  }
}

const BANK_CATEGORIES = new Set<BankBookingCategory>([
  'OFFEN',
  'NK_UMLEGBAR',
  'NK_NICHT_UMLEGBAR',
  'MIETEINGANG',
  'KAUTION',
  'INSTANDHALTUNG',
  'VERWALTUNG',
  'SONSTIGE',
])

export function mapBookings(
  state: MigrationState,
  context: MigrationContext,
  bookings: V3Buchung[],
  path: JsonPath,
  property: PropertyContext,
): void {
  for (const [bookingIndex, booking] of bookings.entries()) {
    const bookingPath = [...path, bookingIndex]
    const legacy: LegacyUnmappedEntry[] = []
    preserveUnknownKeys(
      context,
      booking,
      [
        'id',
        'hash',
        'datum',
        'betrag',
        'auftraggeber',
        'verwendungszweck',
        'buchungstext',
        'kategorie',
        'bemerkung',
        'kostenart_id',
        'abr_jahr',
        'umlage_proz',
        'splits',
        '_heizkreis',
        '_hk',
        '_geprueft',
        '_hauswartvertrag',
        '_importiert',
      ],
      legacy,
      bookingPath,
    )
    const amount = optionalCents(
      context,
      booking.betrag,
      [...bookingPath, 'betrag'],
      ['betrag'],
      legacy,
    )
    if (typeof amount !== 'number') {
      context.issue(
        'error',
        'migration.required_amount_invalid',
        'Der Betrag einer Buchung fehlt oder ist ungültig',
        [...bookingPath, 'betrag'],
      )
      continue
    }
    const category =
      typeof booking.kategorie === 'string' &&
      BANK_CATEGORIES.has(booking.kategorie as BankBookingCategory)
        ? (booking.kategorie as BankBookingCategory)
        : undefined
    if (booking.kategorie != null && !category) {
      context.issue(
        'warning',
        'migration.unknown_booking_category',
        'Eine unbekannte Buchungskategorie wurde nicht übernommen',
        [...bookingPath, 'kategorie'],
      )
      addUnmapped(
        context,
        legacy,
        ['kategorie'],
        [...bookingPath, 'kategorie'],
        booking.kategorie,
      )
    }
    const primaryHeatingTarget = splitEnergyReference(
      booking._heizkreis,
      property.buildingIds,
    )
    const aliasHeatingTarget = splitEnergyReference(
      booking._hk,
      property.buildingIds,
    )
    const heatingTarget = primaryHeatingTarget ?? aliasHeatingTarget
    if (booking._heizkreis != null && !primaryHeatingTarget) {
      context.issue(
        'warning',
        'migration.invalid_energy_reference',
        'Eine Buchungs-Heizkreisreferenz wurde nicht übernommen',
        [...bookingPath, '_heizkreis'],
      )
      addUnmapped(
        context,
        legacy,
        ['_heizkreis'],
        [...bookingPath, '_heizkreis'],
        booking._heizkreis,
      )
    }
    if (booking._hk != null && !aliasHeatingTarget) {
      context.issue(
        'warning',
        'migration.invalid_energy_reference',
        'Eine Buchungs-Heizkreisreferenz wurde nicht übernommen',
        [...bookingPath, '_hk'],
      )
      addUnmapped(
        context,
        legacy,
        ['_hk'],
        [...bookingPath, '_hk'],
        booking._hk,
      )
    } else if (
      primaryHeatingTarget &&
      aliasHeatingTarget &&
      (primaryHeatingTarget.heatingCircuitBuildingId !==
        aliasHeatingTarget.heatingCircuitBuildingId ||
        primaryHeatingTarget.energySourceKey !==
          aliasHeatingTarget.energySourceKey)
    ) {
      context.issue(
        'warning',
        'migration.conflicting_energy_reference',
        'Eine abweichende _hk-Heizkreisreferenz wurde konserviert',
        [...bookingPath, '_hk'],
      )
      addUnmapped(
        context,
        legacy,
        ['_hk'],
        [...bookingPath, '_hk'],
        booking._hk,
      )
    }
    const splits = (booking.splits ?? []).flatMap((split, splitIndex) => {
      const splitPath = [...bookingPath, 'splits', splitIndex]
      const splitLegacy: LegacyUnmappedEntry[] = []
      preserveUnknownKeys(
        context,
        split,
        [
          'id',
          'betrag',
          'kostenart_id',
          'abr_jahr',
          'bemerkung',
          'umlage_proz',
          'kategorie',
          '_hauswartvertrag',
        ],
        splitLegacy,
        splitPath,
      )
      const splitAmount = optionalCents(
        context,
        split.betrag,
        [...splitPath, 'betrag'],
        ['betrag'],
        splitLegacy,
      )
      if (typeof splitAmount !== 'number') {
        context.issue(
          'error',
          'migration.required_amount_invalid',
          'Der Betrag eines Buchungssplits fehlt oder ist ungültig',
          [...splitPath, 'betrag'],
        )
        return []
      }
      const splitCategory =
        typeof split.kategorie === 'string' &&
        BANK_CATEGORIES.has(split.kategorie as BankBookingCategory)
          ? (split.kategorie as BankBookingCategory)
          : undefined
      if (split.kategorie != null && !splitCategory) {
        context.issue(
          'warning',
          'migration.unknown_booking_category',
          'Eine unbekannte Buchungskategorie wurde nicht übernommen',
          [...splitPath, 'kategorie'],
        )
        addUnmapped(
          context,
          splitLegacy,
          ['kategorie'],
          [...splitPath, 'kategorie'],
          split.kategorie,
        )
      }
      return [
        withLegacy(
          {
            id: split.id,
            amountCents: splitAmount,
            costCategoryId: stringOrNullish(split.kostenart_id),
            billingYear: optionalInteger(
              context,
              split.abr_jahr,
              [...splitPath, 'abr_jahr'],
              ['abr_jahr'],
              splitLegacy,
            ),
            note: stringOrNullish(split.bemerkung),
            allocablePercent: optionalPercent(
              context,
              split.umlage_proz,
              [...splitPath, 'umlage_proz'],
              ['umlage_proz'],
              splitLegacy,
            ),
            category: splitCategory,
            isCaretakerContract: optionalBoolean(
              context,
              split._hauswartvertrag,
              [...splitPath, '_hauswartvertrag'],
              ['_hauswartvertrag'],
              splitLegacy,
            ),
          },
          splitLegacy,
        ),
      ]
    })
    state.bankBookings = [
      ...state.bankBookings,
      withLegacy(
        {
          id: booking.id,
          propertyId: property.propertyId,
          dedupeHash: stringOrNullish(booking.hash),
          date: optionalDate(
            context,
            booking.datum,
            [...bookingPath, 'datum'],
            ['datum'],
            legacy,
          ),
          amountCents: amount,
          counterparty: stringOrNullish(booking.auftraggeber),
          purpose: stringOrNullish(booking.verwendungszweck),
          bookingText: stringOrNullish(booking.buchungstext),
          category,
          note: stringOrNullish(booking.bemerkung),
          costCategoryId: stringOrNullish(booking.kostenart_id),
          billingYear: optionalInteger(
            context,
            booking.abr_jahr,
            [...bookingPath, 'abr_jahr'],
            ['abr_jahr'],
            legacy,
          ),
          allocablePercent: optionalPercent(
            context,
            booking.umlage_proz,
            [...bookingPath, 'umlage_proz'],
            ['umlage_proz'],
            legacy,
          ),
          splits: splits.length > 0 ? splits : undefined,
          heatingTarget,
          reviewed: optionalBoolean(
            context,
            booking._geprueft,
            [...bookingPath, '_geprueft'],
            ['_geprueft'],
            legacy,
          ),
          isCaretakerContract: optionalBoolean(
            context,
            booking._hauswartvertrag,
            [...bookingPath, '_hauswartvertrag'],
            ['_hauswartvertrag'],
            legacy,
          ),
          importedAt: optionalTimestamp(
            context,
            booking._importiert,
            [...bookingPath, '_importiert'],
            ['_importiert'],
            legacy,
          ),
        },
        legacy,
      ),
    ]
  }
}

export function mapAuditEvents(
  state: MigrationState,
  context: MigrationContext,
  period: V3Abrechnung,
  path: JsonPath,
): void {
  for (const [eventIndex, event] of (period._protokoll ?? []).entries()) {
    const eventPath = [...path, '_protokoll', eventIndex]
    const legacy: LegacyUnmappedEntry[] = []
    const timestamp = optionalTimestamp(
      context,
      event.ts,
      [...eventPath, 'ts'],
      ['ts'],
      legacy,
    )
    const action = requiredString(
      context,
      event.aktion,
      [...eventPath, 'aktion'],
      'Die Aktion eines Protokolleintrags fehlt',
    )
    if (!timestamp || !action) {
      context.issue(
        'error',
        'migration.invalid_audit_event',
        'Ein Protokolleintrag ist unvollständig',
        eventPath,
      )
      continue
    }
    const details = Object.fromEntries(
      Object.entries(event).filter(
        ([key, value]) =>
          key !== 'ts' && key !== 'aktion' && value !== undefined,
      ),
    )
    state.auditEvents = [
      ...state.auditEvents,
      withLegacy(
        {
          id: context.id([...eventPath, 'audit_event']),
          billingPeriodId: period.id,
          timestamp,
          action,
          details: Object.keys(details).length > 0 ? details : undefined,
        },
        legacy,
      ),
    ]
  }
}
