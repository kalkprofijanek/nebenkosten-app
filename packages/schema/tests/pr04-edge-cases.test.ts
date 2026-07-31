import { describe, expect, it } from 'vitest'

import {
  MAX_LEGACY_COLLECTION_ITEMS,
  MAX_LEGACY_INPUT_NODES,
  MAX_LEGACY_INPUT_SCALARS,
  migrateV3ToCurrent,
} from '../src'
import type { MigrationResult } from '../src'
import { inspectLegacyInput } from '../src/migrations/legacy-v3/limits'
import { createFictionalV3File } from './fixtures'

const OPTIONS = {
  sourceSha256: 'd'.repeat(64),
  sourceFileName: 'fiktive-grenzfaelle.json',
  now: () => new Date('2026-04-05T06:07:08.000Z'),
}

type UnknownRecord = Record<string, unknown>

function records(value: unknown): UnknownRecord[] {
  return value as UnknownRecord[]
}

function fixtureParts() {
  const input = createFictionalV3File()
  const company = records(input.firmen)[0]!
  const object = records(company.objekte)[0]!
  const period = records(object.abrechnungen)[0]!
  return { input, company, object, period }
}

function expectSuccess(result: MigrationResult) {
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result
}

describe('PR 04: fachliche Grenzfälle', () => {
  it('konserviert abweichende Flächenwerte später deduplizierter Nutzerzeilen pfadtreu', () => {
    const { input, period } = fixtureParts()
    const users = records(period.nutzer)
    users.push({
      ...users[0],
      id: 'n_test_dedupe',
      flaeche_nf: 81,
      flaeche_nf_hzg: 75,
      zimmer: 4,
    })

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const unit = result.data.masterData.units.find(
      ({ label }) => label === 'WE 01',
    )!

    expect(unit).toMatchObject({
      usableAreaSqm: { value: 80, unit: 'm2' },
      heatedAreaSqm: { value: 75, unit: 'm2' },
      roomCount: 3,
    })
    expect(unit.legacyUnmapped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['deduplicatedUsers', 2, 'flaeche_nf'],
          value: 81,
        }),
        expect.objectContaining({
          path: ['deduplicatedUsers', 2, 'zimmer'],
          value: 4,
        }),
      ]),
    )
    expect(unit.legacyUnmapped).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['deduplicatedUsers', 2, 'flaeche_nf_hzg'],
        }),
      ]),
    )
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'migration.deduplicated_unit_value_conflict',
          path: [
            'firmen',
            0,
            'objekte',
            0,
            'abrechnungen',
            0,
            'nutzer',
            2,
            'flaeche_nf',
          ],
        }),
        expect.objectContaining({
          code: 'migration.deduplicated_unit_value_conflict',
          path: [
            'firmen',
            0,
            'objekte',
            0,
            'abrechnungen',
            0,
            'nutzer',
            2,
            'zimmer',
          ],
        }),
      ]),
    )
  })

  it('verarbeitet _hk eigenständig und konserviert abweichende Doppelreferenzen', () => {
    const onlyHk = fixtureParts()
    const onlyHkBooking = records(onlyHk.object.buchungen)[0]!
    onlyHkBooking._hk = 'B1:gas'
    const onlyHkResult = expectSuccess(
      migrateV3ToCurrent(onlyHk.input, OPTIONS),
    )
    expect(
      onlyHkResult.data.billingData.bankBookings[0]!.heatingTarget,
    ).toEqual({
      heatingCircuitBuildingId: 'obj_test001:B1',
      energySourceKey: 'gas',
    })

    const invalidHk = fixtureParts()
    const invalidHkBooking = records(invalidHk.object.buchungen)[0]!
    invalidHkBooking._hk = 'ungueltig'
    const invalidHkResult = expectSuccess(
      migrateV3ToCurrent(invalidHk.input, OPTIONS),
    )
    expect(
      invalidHkResult.data.billingData.bankBookings[0]!.legacyUnmapped,
    ).toContainEqual({ path: ['_hk'], value: 'ungueltig' })
    expect(invalidHkResult.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'migration.invalid_energy_reference',
        path: ['firmen', 0, 'objekte', 0, 'buchungen', 0, '_hk'],
      }),
    )

    const both = fixtureParts()
    const bothBooking = records(both.object.buchungen)[0]!
    bothBooking._heizkreis = 'B1:haupt'
    bothBooking._hk = 'B1:gas'
    const bothResult = expectSuccess(migrateV3ToCurrent(both.input, OPTIONS))
    expect(bothResult.data.billingData.bankBookings[0]!.heatingTarget).toEqual({
      heatingCircuitBuildingId: 'obj_test001:B1',
      energySourceKey: 'haupt',
    })
    expect(
      bothResult.data.billingData.bankBookings[0]!.legacyUnmapped,
    ).toContainEqual({ path: ['_hk'], value: 'B1:gas' })
    expect(bothResult.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'migration.conflicting_energy_reference',
        path: ['firmen', 0, 'objekte', 0, 'buchungen', 0, '_hk'],
      }),
    )
  })

  it('behandelt leere Legacy-Referenzen und Anreden als nicht gesetzt', () => {
    const { input, company, object, period } = fixtureParts()
    const booking = records(object.buchungen)[0]!
    const user = records(period.nutzer)[0]!
    booking._heizkreis = ''
    booking._hk = ''
    user.anrede = ''
    ;(company.ansprechpartner as UnknownRecord).anrede = ''

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.invalid_energy_reference' }),
        expect.objectContaining({ code: 'migration.unknown_salutation' }),
      ]),
    )
    expect(result.data.billingData.bankBookings[0]!.legacyUnmapped).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['_heizkreis'] }),
        expect.objectContaining({ path: ['_hk'] }),
      ]),
    )
  })

  it('meldet beim Einzel-Heizkreis-Fallback echte co2- und brennstoff-Quellpfade', () => {
    const { input, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    period.brennstoff = {
      ...(circuit.brennstoff as UnknownRecord),
      anfangsbestand_menge: 'nicht-parsebar',
    }
    period.co2 = {
      ...(circuit.co2 as UnknownRecord),
      modus: 'unbekannt',
    }
    delete period.heizkreise

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const serializedReport = JSON.stringify(result.report)

    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'migration.unknown_co2_mode',
          path: ['firmen', 0, 'objekte', 0, 'abrechnungen', 0, 'co2', 'modus'],
        }),
        expect.objectContaining({
          code: 'migration.invalid_number',
          path: [
            'firmen',
            0,
            'objekte',
            0,
            'abrechnungen',
            0,
            'brennstoff',
            'anfangsbestand_menge',
          ],
        }),
      ]),
    )
    expect(result.report.unmappedFields).toEqual(
      expect.arrayContaining([
        'firmen[0].objekte[0].abrechnungen[0].co2.modus',
        'firmen[0].objekte[0].abrechnungen[0].brennstoff.anfangsbestand_menge',
      ]),
    )
    expect(serializedReport).not.toContain('brennstoff.co2')
    expect(serializedReport).not.toContain('brennstoff.brennstoff')
  })

  it('migriert den Einzel-Heizkreis-Fallback mit neutralem Hauptenergieträger', () => {
    const { input, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    period.brennstoff = circuit.brennstoff
    period.co2 = circuit.co2
    delete period.heizkreise

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.data.billingData.heatingCircuits).toHaveLength(1)
    expect(result.data.billingData.energySources[0]).toMatchObject({
      key: 'haupt',
      sourceType: 'Heizöl',
    })
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'migration.single_heating_fallback' }),
    )
  })

  it('migriert mehrere Energiequellen und manuelle CO2-Werte', () => {
    const { input, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    delete circuit.brennstoff
    circuit.energiequellen = [
      {
        id: 'gas_test',
        name: 'Fiktive Gasquelle',
        art: 'Erdgas',
        heizwert_kwh: 9.8,
        co2_faktor_kg_kwh: 0.2,
        anfangsbestand_menge: 20,
        lieferungen: [
          {
            datum: '2024-06-01',
            menge: 500,
            mengeneinheit: 'm³',
            betrag: 321.09,
            _menge_manuell: true,
          },
        ],
      },
    ]
    circuit.co2 = {
      modus: 'manuell',
      co2_faktor_kg_kwh: 0.2,
      co2_preis_eur_t: 45,
      abgabe: 123.45,
      aufteilung_vermieter_proz: 40,
      kennwert_kg_m2a: 22,
    }

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.data.billingData.heatingCircuits[0]!.co2).toMatchObject({
      mode: 'manual',
      levyCents: 12345,
      landlordSharePercent: 40,
    })
    expect(result.data.billingData.energySources[0]).toMatchObject({
      key: 'gas_test',
      co2FactorKgPerKwh: 0.2,
    })
    expect(result.data.billingData.fuelDeliveries[0]).toMatchObject({
      quantity: { value: 500, unit: 'm3' },
      quantityManuallySet: true,
      amountCents: 32109,
    })
  })

  it('meldet unbekannte optionale Werte redigiert und konserviert sie', () => {
    const { input, object, period } = fixtureParts()
    const cost = records(period.kostenarten)[0]!
    const meter = records(object.stromzaehler)[0]!
    period.status = 'INTERN-SONDERSTATUS'
    cost.typ = 'sonderkosten'
    cost.umlage_nach = 'sonder-schluessel'
    cost.umlage_proz = 120
    meter.zaehlernummer_status = 'ungeklaert'
    meter.gueltig_bis = '2024-02-31'
    const statuses = meter.jahresstatus as UnknownRecord
    statuses['2026'] = {
      buchung_vorhanden: 'ja',
      jahresrechnung_vorhanden: 0,
      schaetzung_betrag: '1.234,56',
    }

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const reportText = JSON.stringify(result.report)
    const targetText = JSON.stringify(result.data)

    expect(result.data.billingData.billingPeriods[0]!.status).toBe('DRAFT')
    expect(result.data.billingData.costCategories[0]).toMatchObject({
      kind: 'operating',
    })
    expect(result.data.billingData.costCategories[0]).not.toHaveProperty(
      'allocationKey',
    )
    const statusWithoutBillingPeriod =
      result.data.billingData.meterBillingStatuses.find(
        ({ year }) => year === 2026,
      )
    expect(statusWithoutBillingPeriod).toMatchObject({
      year: 2026,
      bookingPresent: true,
      annualInvoicePresent: false,
      estimateAmountCents: 123456,
    })
    expect(statusWithoutBillingPeriod).not.toHaveProperty('billingPeriodId')
    expect(reportText).not.toContain('INTERN-SONDERSTATUS')
    expect(targetText).toContain('INTERN-SONDERSTATUS')
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.unknown_billing_status' }),
        expect.objectContaining({ code: 'migration.unknown_cost_kind' }),
        expect.objectContaining({ code: 'migration.invalid_percent' }),
        expect.objectContaining({
          code: 'migration.meter_year_without_billing_period',
        }),
      ]),
    )
  })

  it('konserviert strukturell falsche Hauswart-Markierungen redigiert', () => {
    const { input, object } = fixtureParts()
    const booking = records(object.buchungen)[0]!
    booking._hauswartvertrag = {
      titel: 'Fiktiver Hauswartvertrag',
      dienstleister: 'Beispielservice',
      netto_monat: 100,
      aufgeteilt_am: '2025-01-01',
      regel: 'fiktive-regel',
    }

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const migratedBooking = result.data.billingData.bankBookings[0]!

    expect(migratedBooking.isCaretakerContract).toBe(true)
    expect(migratedBooking.legacyUnmapped).toContainEqual({
      path: ['_hauswartvertrag'],
      value: {
        titel: 'Fiktiver Hauswartvertrag',
        dienstleister: 'Beispielservice',
        netto_monat: 100,
        aufgeteilt_am: '2025-01-01',
        regel: 'fiktive-regel',
      },
    })
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'migration.caretaker_contract_details_preserved',
        path: ['firmen', 0, 'objekte', 0, 'buchungen', 0, '_hauswartvertrag'],
      }),
    )
    expect(JSON.stringify(result.report)).not.toContain(
      'Fiktiver Hauswartvertrag',
    )
  })

  it.each([{}, { beliebig: 'fiktiv' }])(
    'weist nicht nachgewiesene Hauswart-Objekte ab',
    (marker) => {
      const { input, object } = fixtureParts()
      records(object.buchungen)[0]!._hauswartvertrag = marker

      const result = migrateV3ToCurrent(input, OPTIONS)

      expect(result).toMatchObject({
        ok: false,
        reason: 'invalid_json_structure',
        issues: [
          expect.objectContaining({ code: 'schema.invalid_json_structure' }),
        ],
      })
    },
  )

  it('beachtet die Priorität monthly vor annual und bildet annual/none_agreed ab', () => {
    const { input, period } = fixtureParts()
    const users = records(period.nutzer)
    users[0]!.vz_monat = null
    users[0]!.vz_gesamt = 987.65
    users[1]!.vz_monat = null
    users[1]!.vz_gesamt = null
    users[1]!.keine_vz_vereinbart = true

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.data.billingData.prepayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'annual', annualAmountCents: 98765 }),
        expect.objectContaining({ mode: 'none_agreed' }),
      ]),
    )
  })

  it('übernimmt gültige Anhänge und konserviert ungültige Anhänge', () => {
    const { input, period } = fixtureParts()
    const heatingCost = records(period.kostenarten)[1]!
    const receipt = records(heatingCost.rechnungen)[0]!
    Object.assign(receipt, {
      datei_name: 'beleg.pdf',
      datei_typ: 'application/pdf',
      datei_data: 'data:application/pdf;base64,JVBERg==',
    })
    records(heatingCost.rechnungen).push({
      betrag: 1,
      datei_name: 'falsch.pdf',
      datei_typ: 'application/pdf',
      datei_data: 'data:application/pdf;base64,PGgxPnRlc3Q8L2gxPg==',
    })

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.data.billingData.costEntries[0]!.attachment).toMatchObject({
      fileName: 'beleg.pdf',
      mimeType: 'application/pdf',
    })
    expect(result.data.billingData.costEntries[1]!.attachment).toBeUndefined()
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'migration.invalid_attachment' }),
    )
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'migration.attachment_signature_mismatch',
      }),
    )
    expect(JSON.stringify(result.data)).toContain('falsch.pdf')
  })

  it('konserviert konkurrierende historische Rootfelder neben abrechnungen', () => {
    const { input, object } = fixtureParts()
    object.jahr = 1999
    object.nutzer = [{ id: 'n_alt_test', name: 'Nur konserviert' }]

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(result.data.billingData.billingPeriods).toHaveLength(1)
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'migration.historical_root_conflict' }),
    )
    expect(JSON.stringify(result.data.masterData.properties[0])).toContain(
      'n_alt_test',
    )
  })

  it('konserviert ungültige Brennstoffbestände an der Zielentität', () => {
    const { input, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    const fuel = circuit.brennstoff as UnknownRecord
    fuel.anfangsbestand_menge = 'NICHT-MESSBAR'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(
      result.data.billingData.fuelStocks[0]!.openingQuantity,
    ).toBeUndefined()
    expect(
      result.data.billingData.fuelStocks[0]!.legacyUnmapped,
    ).toContainEqual({
      path: ['anfangsbestand_menge'],
      value: 'NICHT-MESSBAR',
    })
    expect(JSON.stringify(result.report)).not.toContain('NICHT-MESSBAR')
  })

  it('konserviert unbekannte Felder in verschachtelten Legacy-Objekten', () => {
    const { input, company, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    const statuses = period.standardKostenartenStatus as UnknownRecord

    ;(period.zeitraum as UnknownRecord).zeitraum_zukunft = 'bleibt-zeitraum'
    ;(period.vorgaben as UnknownRecord).vorgabe_zukunft = 'bleibt-vorgabe'
    ;(period.gesamt as UnknownRecord).gesamt_zukunft = 'bleibt-gesamt'
    ;(statuses.grundsteuer as UnknownRecord).status_zukunft = 'bleibt-status'
    ;(period.hinweise as UnknownRecord).hinweis_zukunft = 'bleibt-hinweis'
    ;(period.anschreiben as UnknownRecord).anschreiben_zukunft =
      'bleibt-anschreiben'
    ;(circuit.co2 as UnknownRecord).co2_zukunft = 'bleibt-co2'
    ;(circuit.vorgaben as UnknownRecord).heizvorgabe_zukunft =
      'bleibt-heizvorgabe'
    ;(company.ansprechpartner as UnknownRecord).kontakt_zukunft =
      'bleibt-kontakt'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const targetText = JSON.stringify(result.data)

    for (const marker of [
      'bleibt-zeitraum',
      'bleibt-vorgabe',
      'bleibt-gesamt',
      'bleibt-status',
      'bleibt-hinweis',
      'bleibt-anschreiben',
      'bleibt-co2',
      'bleibt-heizvorgabe',
      'bleibt-kontakt',
    ]) {
      expect(targetText).toContain(marker)
      expect(JSON.stringify(result.report)).not.toContain(marker)
    }
  })

  it('warnt bei ungültigen Vorauszahlungen und konserviert die Rohwerte', () => {
    const { input, period } = fixtureParts()
    const users = records(period.nutzer)
    users[0]!.vz_monat = 'MONAT-UNGÜLTIG'
    users[0]!.vz_gesamt = 987.65
    users[1]!.vz_monat = null
    users[1]!.vz_gesamt = 'JAHR-UNGÜLTIG'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const targetText = JSON.stringify(result.data)

    expect(result.data.billingData.prepayments).toContainEqual(
      expect.objectContaining({ mode: 'annual', annualAmountCents: 98765 }),
    )
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.invalid_number' }),
      ]),
    )
    expect(targetText).toContain('MONAT-UNGÜLTIG')
    expect(targetText).toContain('JAHR-UNGÜLTIG')
    expect(JSON.stringify(result.report)).not.toContain('MONAT-UNGÜLTIG')
    expect(JSON.stringify(result.report)).not.toContain('JAHR-UNGÜLTIG')
  })

  it('konserviert bekannte, aber ungültige optionale Werte', () => {
    const { input, company, object, period } = fixtureParts()
    const circuit = records(period.heizkreise)[0]!
    const delivery = records(
      (circuit.brennstoff as UnknownRecord).lieferungen,
    )[0]!
    const booking = records(object.buchungen)[0]!
    const split = records(booking.splits)[0]!

    ;(period.vorgaben as UnknownRecord).grundkosten_umlage = 'SONDERFLÄCHE'
    ;(period.vorgaben as UnknownRecord).mwst_modus = 'MISCHFORM'
    ;(company.ansprechpartner as UnknownRecord).anrede = 'DIVERS'
    split.kategorie = 'SPLIT-SONDERKATEGORIE'
    delivery.mengeneinheit = 'FASS'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const targetText = JSON.stringify(result.data)

    for (const marker of [
      'SONDERFLÄCHE',
      'MISCHFORM',
      'DIVERS',
      'SPLIT-SONDERKATEGORIE',
      'FASS',
    ]) {
      expect(targetText).toContain(marker)
      expect(JSON.stringify(result.report)).not.toContain(marker)
    }
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'migration.unknown_base_cost_basis' }),
        expect.objectContaining({ code: 'migration.unknown_vat_mode' }),
        expect.objectContaining({ code: 'migration.unknown_salutation' }),
        expect.objectContaining({ code: 'migration.unknown_booking_category' }),
        expect.objectContaining({ code: 'migration.unknown_quantity_unit' }),
      ]),
    )
  })

  it.each([
    [
      'Kostenartbezeichnung',
      (parts: ReturnType<typeof fixtureParts>) => {
        delete records(parts.period.kostenarten)[0]!.bezeichnung
      },
    ],
    [
      'Belegbetrag',
      (parts: ReturnType<typeof fixtureParts>) => {
        delete records(records(parts.period.kostenarten)[1]!.rechnungen)[0]!
          .betrag
      },
    ],
    [
      'Buchungsbetrag',
      (parts: ReturnType<typeof fixtureParts>) => {
        delete records(parts.object.buchungen)[0]!.betrag
      },
    ],
    [
      'Zählerart',
      (parts: ReturnType<typeof fixtureParts>) => {
        records(parts.object.stromzaehler)[0]!.art = 'unbekannt'
      },
    ],
    [
      'Auditaktion',
      (parts: ReturnType<typeof fixtureParts>) => {
        delete records(parts.period._protokoll)[0]!.aktion
      },
    ],
  ])(
    'bricht bei ungültigem Pflichtwert %s kontrolliert ab',
    (_label, mutate) => {
      const parts = fixtureParts()
      mutate(parts)

      const result = migrateV3ToCurrent(parts.input, OPTIONS)

      expect(result).toMatchObject({ ok: false, reason: 'validation_failed' })
    },
  )
})

describe('PR 04: Options- und Versionsschutz', () => {
  it('weist ungültige Optionen und bereits aktuelle Dateien zurück', () => {
    expect(
      migrateV3ToCurrent({ version: 3, firmen: [] }, { sourceSha256: 'x' }),
    ).toMatchObject({ ok: false, reason: 'validation_failed' })
    expect(
      migrateV3ToCurrent(
        { version: 3, firmen: [] },
        { sourceSha256: 'a'.repeat(64), sourceFileName: '../privat.json' },
      ),
    ).toMatchObject({ ok: false, reason: 'validation_failed' })
    expect(
      migrateV3ToCurrent(
        { schemaVersion: 4 },
        { sourceSha256: 'a'.repeat(64) },
      ),
    ).toMatchObject({ ok: false, reason: 'unsupported_schema_version' })
    expect(
      migrateV3ToCurrent(
        { version: 3, firmen: [] },
        {
          sourceSha256: 'a'.repeat(64),
          now: () => new Date(Number.NaN),
        },
      ),
    ).toMatchObject({ ok: false, reason: 'validation_failed' })
  })

  it('fängt werfende Getter an der direkten Objektgrenze kontrolliert ab', () => {
    const hostileInput = Object.defineProperty({}, 'version', {
      enumerable: true,
      get: () => {
        throw new Error('darf die Migrationsgrenze nicht verlassen')
      },
    })

    expect(() => migrateV3ToCurrent(hostileInput, OPTIONS)).not.toThrow()
    expect(migrateV3ToCurrent(hostileInput, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
    })
  })

  it('konserviert einen ungültigen Root-Zeitstempel ohne Rohwert im Bericht', () => {
    const input = createFictionalV3File()
    input.gespeichert = 'PRIVATER-ALTZEITSTEMPEL'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(
      result.data.masterData.organizations[0]!.legacyUnmapped,
    ).toContainEqual({
      path: ['gespeichert'],
      value: 'PRIVATER-ALTZEITSTEMPEL',
    })
    expect(JSON.stringify(result.report)).not.toContain(
      'PRIVATER-ALTZEITSTEMPEL',
    )
  })

  it('fängt werfende Options-Getter und Zeitquellen kontrolliert ab', () => {
    const hostileOptions = Object.defineProperty({}, 'sourceSha256', {
      enumerable: true,
      get: () => {
        throw new Error('darf die Migrationsgrenze nicht verlassen')
      },
    })
    const hostileNow = () => {
      throw new Error('darf die Migrationsgrenze nicht verlassen')
    }

    expect(() =>
      migrateV3ToCurrent(
        createFictionalV3File(),
        hostileOptions as typeof OPTIONS,
      ),
    ).not.toThrow()
    expect(
      migrateV3ToCurrent(
        createFictionalV3File(),
        hostileOptions as typeof OPTIONS,
      ),
    ).toMatchObject({ ok: false, reason: 'validation_failed' })
    expect(() =>
      migrateV3ToCurrent(createFictionalV3File(), {
        ...OPTIONS,
        now: hostileNow,
      }),
    ).not.toThrow()
    expect(
      migrateV3ToCurrent(createFictionalV3File(), {
        ...OPTIONS,
        now: hostileNow,
      }),
    ).toMatchObject({ ok: false, reason: 'validation_failed' })
  })

  it('begrenzt einzelne Collections und die gesamte Eingabestruktur vor der Transformation', () => {
    const tooManyCompanies = {
      version: 3,
      firmen: Array.from(
        { length: MAX_LEGACY_COLLECTION_ITEMS + 1 },
        (_, index) => ({ id: `f${index}`, name1: 'Fiktiv' }),
      ),
    }
    const tooManyNodes = createFictionalV3File()
    const chunkCount =
      Math.ceil(MAX_LEGACY_INPUT_NODES / MAX_LEGACY_COLLECTION_ITEMS) + 1
    tooManyNodes.unbekannt = Array.from({ length: chunkCount }, (_, chunk) =>
      Array.from({ length: MAX_LEGACY_COLLECTION_ITEMS }, (_, index) => ({
        chunk,
        index,
      })),
    )
    const tooManyScalars = createFictionalV3File()
    const scalarChunkCount =
      Math.ceil(MAX_LEGACY_INPUT_SCALARS / MAX_LEGACY_COLLECTION_ITEMS) + 1
    tooManyScalars.unbekannt = Array.from(
      { length: scalarChunkCount },
      (_, chunk) =>
        Array.from(
          { length: MAX_LEGACY_COLLECTION_ITEMS },
          (_, index) => `${chunk}-${index}`,
        ),
    )

    expect(migrateV3ToCurrent(tooManyCompanies, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.input_limits_exceeded' }],
    })
    expect(migrateV3ToCurrent(tooManyNodes, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.input_limits_exceeded' }],
    })
    expect(migrateV3ToCurrent(tooManyScalars, OPTIONS)).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.input_limits_exceeded' }],
    })
  })

  it('akzeptiert eine legitime produktionsnahe Struktur mit rund 32.000 Knoten', () => {
    const productionScale = {
      version: 3,
      segments: Array.from({ length: 64 }, () =>
        Array.from({ length: 500 }, (_, index) => index),
      ),
    }

    expect(inspectLegacyInput(productionScale)).toBe('ok')
  })

  it('redigiert dynamische unbekannte Schlüssel im Bericht und konserviert nur die Originaldaten', () => {
    const input = createFictionalV3File()
    const privateKey = 'MANDANT_INTERN_GEHEIM_4711'
    input[privateKey] = 'bleibt-ausschliesslich-im-zieldatensatz'

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))

    expect(JSON.stringify(result.data)).toContain(privateKey)
    expect(JSON.stringify(result.report)).not.toContain(privateKey)
    expect(result.report.unmappedFields).toContain('<unknown-field>')
  })

  it('weist __proto__ explizit und redigiert zurück, ohne den Schlüssel zu mergen', () => {
    const input = JSON.parse(
      '{"version":3,"firmen":[],"__proto__":{"polluted":"nur-konserviert"}}',
    ) as Record<string, unknown>

    const result = migrateV3ToCurrent(input, OPTIONS)

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_json_structure',
      issues: [{ code: 'migration.reserved_key_rejected' }],
    })
    expect(JSON.stringify(result)).not.toContain('__proto__')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
