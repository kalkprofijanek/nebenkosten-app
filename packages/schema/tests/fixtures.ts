/**
 * Frei erfundene, klar fiktive Testdaten (Mustermann-Stil).
 *
 * DATENSCHUTZ: Diese Werte sind vollständig ausgedacht und dürfen keine
 * Ähnlichkeit mit produktiven Daten haben. Keine echten Namen, Adressen,
 * IBANs, E-Mail-Adressen, Zählernummern oder Beträge verwenden — auch
 * keine Werte aus legacy/index.html (inkl. der sanitisierten Platzhalter
 * dort, siehe ADR-0001).
 */
import type { AppDataFile } from '../src'
import { CURRENT_SCHEMA_VERSION } from '../src'

/** Fiktive, vollständige Legacy-v3-Datei mit unbekannten Zusatzfeldern. */
export function createFictionalV3File(): Record<string, unknown> {
  return {
    version: 3,
    gespeichert: '2025-01-15T09:30:00.000Z',
    // Unbekanntes Zukunftsfeld auf Root-Ebene — muss erhalten bleiben:
    _experimentelles_rootfeld: { hinweis: 'bleibt erhalten' },
    firmen: [
      {
        id: 'f_test001',
        name1: 'Mustermann Hausverwaltung GmbH',
        name2: 'Testmandant',
        strasse: 'Mustergasse 1',
        plz_ort: '00001 Musterstadt',
        postfach: null,
        ansprechpartner: {
          anrede: 'Frau',
          vorname: 'Erika',
          name: 'Musterfrau',
          telefon: '0000 000000',
        },
        bank: {
          iban: 'DE00 0000 0000 0000 0000 00',
          bic: 'TESTDE00XXX',
          kontoinhaber: 'Mustermann Hausverwaltung GmbH',
          kreditinstitut: 'Musterbank (fiktiv)',
        },
        objekte: [
          {
            id: 'obj_test001',
            eigene_nr: 'T-001',
            objekt_nr: 'EXT-9999',
            strasse: 'Beispielgasse 2-4',
            plz_ort: '00001 Musterstadt',
            iban: null,
            kontoinhaber: null,
            excel_quelle: {
              leerstand_2024: 1,
              mietparteien_2024: 3,
              gesamtwohnflaeche: 240,
            },
            bloecke: [
              {
                id: 'B1',
                name: 'Testhaus Vorne',
                kuerzel: 'TV',
                energietraeger: 'Heizöl',
                prefix: ['TV'],
                hk: 'HK-ALT',
                zukunftsfeld_block: 'bleibt',
              },
            ],
            stromzaehler: [
              {
                id: 'sz_test001',
                adresse: 'Beispielgasse 2, Keller',
                zaehlernummer: '0-TEST-0000000',
                malo_id: null,
                art: 'allgemein',
                anbieter: 'Musterstrom (fiktiv)',
                vertragsnummer_oder_konto: 'V-000000',
                gueltig_von: '2024-01-01',
                zaehlernummer_status: 'offen',
                jahresstatus: {
                  '2024': {
                    buchung_vorhanden: true,
                    jahresrechnung_vorhanden: false,
                    notiz: 'Rechnung angefordert',
                  },
                },
              },
            ],
            buchungen: [
              {
                id: 'bch_test001',
                hash: 'testhash-0001',
                datum: '2024-03-05',
                betrag: -250.5,
                auftraggeber: 'Musterfirma Dienstleistung',
                verwendungszweck: 'Testleistung März',
                buchungstext: 'LASTSCHRIFT',
                kategorie: 'NK_UMLEGBAR',
                kostenart_id: 'k_test002',
                abr_jahr: 2024,
                _geprueft: false,
                splits: [
                  {
                    id: 'sp_test001',
                    betrag: -250.5,
                    kostenart_id: 'k_test002',
                    abr_jahr: 2024,
                    bemerkung: 'voll zugeordnet',
                  },
                ],
              },
            ],
            abrechnungen: [
              {
                id: 'abr_test001',
                jahr: 2024,
                zeitraum: { von: '2024-01-01', bis: '2024-12-31' },
                status: 'Entwurf',
                vorgaben: {
                  verbrauch_proz: 70,
                  grund_proz: 30,
                  grundkosten_umlage: 'm2_nf_hzg',
                  solar_proz: 0,
                  betriebsstrom_proz: 5,
                  mwst_modus: 'brutto',
                },
                gesamt: {
                  flaeche: 240,
                  flaeche_hzg: 220,
                  personen: 5,
                  einheiten: 1000,
                },
                nutzer: [
                  {
                    id: 'n_test001',
                    nr: 1,
                    aktiv: 'J',
                    anrede: 'Herr',
                    vorname: 'Max',
                    nachname: 'Mustermann',
                    nutzeinheit: 'WE 01',
                    lage: 'EG links',
                    mandatsref: 'TV_001',
                    firma_privat: 'Privat',
                    eingezogen: '2023-05-01',
                    ausgezogen: '',
                    flaeche_nf: 80,
                    flaeche_nf_hzg: 75,
                    personen: 2,
                    zimmer: 3,
                    einheiten: 400,
                    einheiten_geschaetzt: false,
                    kuerzung12_anwenden: false,
                    vz_monat: 180,
                    miete_monat: 650,
                    bemerkung: 'fiktiver Testnutzer',
                    kaltwasser_m3: 42.5,
                    _zukunftsfeld_nutzer: 'bleibt',
                  },
                  {
                    id: 'n_test002',
                    nr: 2,
                    aktiv: 'Leerstand',
                    leerstand: true,
                    name: 'Leerstand WE 02',
                    nutzeinheit: 'WE 02',
                    mandatsref: 'TV_leerstand',
                    flaeche_nf: 60,
                    flaeche_nf_hzg: 55,
                    personen: 0,
                    einheiten: 0,
                    vz_monat: 0,
                    keine_vz_vereinbart: true,
                  },
                ],
                kostenarten: [
                  {
                    id: 'k_test001',
                    standard_key: 'grundsteuer',
                    typ: 'betrieb',
                    bezeichnung: 'Grundsteuer',
                    kostentext: 'Grundsteuer',
                    betrKV_kat: 'GRUNDSTEUER',
                    umlage_nach: 'm2_nf',
                    betrag: 1200,
                    datum: '2024-07-01',
                    rechnungen: [],
                  },
                  {
                    id: 'k_test002',
                    typ: 'heizung',
                    bezeichnung: 'Heizungswartung',
                    kostentext: 'Wartung Heizungsanlage',
                    betrKV_kat: 'HEIZUNG',
                    betrag: 250.5,
                    scope_key: 'B1',
                    lohn_anteil_proz: 40,
                    rechnungen: [
                      {
                        datum: '2024-03-05',
                        bezeichnung: 'Wartung Frühjahr',
                        betrag: 250.5,
                        beleg: 'R-2024-0001',
                        umlage_proz: 100,
                        _buchung: 'bch_test001',
                        _buchung_split: 'sp_test001',
                      },
                    ],
                  },
                ],
                standardKostenartenStatus: {
                  grundsteuer: { aktiv: true, grund: '' },
                  muell: { aktiv: false, grund: 'Direktvertrag Mieter' },
                },
                heizkreise: [
                  {
                    id: 'B1',
                    hat_warmwasser: true,
                    ww_anteil_proz: 18,
                    brennstoff: {
                      art: 'Heizöl',
                      heizwert_kwh: 10,
                      anfangsbestand_menge: 1500,
                      anfangsbestand_wert: 1425,
                      anfangsbestand_preis: 0.95,
                      restbestand_menge: 500,
                      lieferungen: [
                        {
                          datum: '2024-02-10',
                          menge: 2000,
                          mengeneinheit: 'l',
                          betrag: 1900,
                          bezeichnung: 'Lieferung Februar',
                          beleg: 'L-2024-0001',
                        },
                      ],
                    },
                    co2: {
                      modus: 'auto',
                      co2_faktor_kg_kwh: 0.266,
                      co2_preis_eur_t: 45,
                    },
                    vorgaben: {
                      verbrauch_proz: 70,
                      grund_proz: 30,
                      betriebsstrom_proz: 5,
                    },
                  },
                ],
                hinweise: {
                  allgemein: 'Fiktiver Hinweistext — nur für Tests.',
                  guthaben: null,
                  nachzahlung: null,
                },
                anschreiben: { aktiv: false, text: '' },
                _protokoll: [
                  {
                    ts: 1736900000000,
                    aktion: 'Status: Entwurf',
                    nutzerAnzahl: 2,
                  },
                ],
                _ts: 1736900000000,
              },
            ],
          },
        ],
      },
    ],
  }
}

/** Minimale, gültige Datei im aktuellen Format mit einem Datensatz je Container-Kern. */
export function createFictionalAppDataFile(): AppDataFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      savedAt: '2025-01-15T09:30:00.000Z',
      appVersion: 'test-only',
      migratedFrom: null,
    },
    masterData: {
      organizations: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Testmandant (fiktiv)',
        },
      ],
      ownerCompanies: [
        {
          id: 'f_test001',
          organizationId: '11111111-1111-4111-8111-111111111111',
          name: 'Mustermann Hausverwaltung GmbH',
          additionalNameLines: ['Testmandant'],
          address: {
            street: 'Mustergasse 1',
            postalCodeAndCity: '00001 Musterstadt',
          },
          postBox: null,
          contact: {
            salutation: 'Frau',
            firstName: 'Erika',
            lastName: 'Musterfrau',
          },
          bankAccount: {
            iban: 'DE00 0000 0000 0000 0000 00',
            bic: 'TESTDE00XXX',
            accountHolder: 'Mustermann Hausverwaltung GmbH',
            bankName: 'Musterbank (fiktiv)',
          },
        },
      ],
      properties: [
        {
          id: 'obj_test001',
          ownerCompanyId: 'f_test001',
          internalNumber: 'T-001',
          externalNumber: 'EXT-9999',
          address: {
            street: 'Beispielgasse 2-4',
            postalCodeAndCity: '00001 Musterstadt',
          },
          bankAccount: null,
          legacySourceInfo: { gesamtwohnflaeche: 240 },
        },
      ],
      buildings: [
        {
          id: 'B1',
          propertyId: 'obj_test001',
          name: 'Testhaus Vorne',
          shortName: 'TV',
          defaultEnergySourceType: 'Heizöl',
          mandateRefPrefixes: ['TV'],
        },
      ],
      units: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          propertyId: 'obj_test001',
          buildingId: 'B1',
          label: 'WE 01',
          location: 'EG links',
          usableAreaSqm: { value: 80, unit: 'm2' },
          heatedAreaSqm: { value: 75, unit: 'm2' },
          roomCount: 3,
        },
      ],
      persons: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          organizationId: '11111111-1111-4111-8111-111111111111',
          salutation: 'Herr',
          firstName: 'Max',
          lastName: 'Mustermann',
          companyOrPrivate: 'Privat',
        },
      ],
      tenancies: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          unitId: '22222222-2222-4222-8222-222222222222',
          personIds: ['33333333-3333-4333-8333-333333333333'],
          mandateReference: 'TV_001',
          movedIn: '2023-05-01',
          movedOut: null,
          monthlyRentCents: 65000,
        },
      ],
      allocationRules: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          organizationId: '11111111-1111-4111-8111-111111111111',
          name: 'Nutzfläche',
          key: 'usable_area',
        },
      ],
      heatingSystems: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          propertyId: 'obj_test001',
          name: 'Zentralheizung (fiktiv)',
        },
      ],
      meters: [
        {
          id: 'sz_test001',
          propertyId: 'obj_test001',
          kind: 'general',
          address: 'Beispielgasse 2, Keller',
          meterNumber: '0-TEST-0000000',
          provider: 'Musterstrom (fiktiv)',
          contractOrAccountNumber: 'V-000000',
          validFrom: '2024-01-01',
          meterNumberStatus: 'open',
        },
      ],
    },
    billingData: {
      billingPeriods: [
        {
          id: 'abr_test001',
          propertyId: 'obj_test001',
          year: 2024,
          periodStart: '2024-01-01',
          periodEnd: '2024-12-31',
          status: 'DRAFT',
          dispatchDate: null,
          heatingDefaults: {
            consumptionSharePercent: 70,
            baseSharePercent: 30,
            baseCostAreaBasis: 'heated_area',
            solarSharePercent: 0,
            operatingElectricitySharePercent: 5,
            vatMode: 'brutto',
          },
          totals: {
            usableAreaSqm: { value: 240, unit: 'm2' },
            heatedAreaSqm: { value: 220, unit: 'm2' },
            persons: { value: 5, unit: 'personen' },
            consumptionUnits: { value: 1000, unit: 'einheiten' },
          },
          standardCostCategoryStatus: {
            grundsteuer: { active: true, reason: null },
          },
          notes: { general: 'Fiktiver Hinweis — nur für Tests.' },
          coverLetter: { active: false, text: '' },
          lastModifiedAt: '2025-01-15T09:30:00.000Z',
        },
      ],
      occupancyPeriods: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          billingPeriodId: 'abr_test001',
          unitId: '22222222-2222-4222-8222-222222222222',
          tenancyId: '44444444-4444-4444-8444-444444444444',
          kind: 'tenant',
          displayOrder: 1,
          from: null,
          to: null,
          persons: { value: 2, unit: 'personen' },
          consumptionUnits: { value: 400, unit: 'einheiten' },
          consumptionUnitsEstimated: false,
          applySection12Reduction: false,
          coldWater: { value: 42.5, unit: 'm3' },
        },
      ],
      prepayments: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          occupancyPeriodId: '99999999-9999-4999-8999-999999999999',
          mode: 'monthly',
          monthlyAmountCents: 18000,
        },
      ],
      costCategories: [
        {
          id: 'k_test001',
          billingPeriodId: 'abr_test001',
          standardKey: 'grundsteuer',
          kind: 'operating',
          label: 'Grundsteuer',
          statementText: 'Grundsteuer',
          betrkvCategory: 'GRUNDSTEUER',
          allocationKey: 'usable_area',
          scope: { kind: 'property' },
          totalAmountCents: 120000,
          date: '2024-07-01',
        },
      ],
      costEntries: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          costCategoryId: 'k_test001',
          date: '2024-07-01',
          description: 'Bescheid (fiktiv)',
          amountCents: 120000,
          receiptReference: 'R-2024-0001',
          allocablePercent: 100,
        },
      ],
      bankBookings: [
        {
          id: 'bch_test001',
          propertyId: 'obj_test001',
          dedupeHash: 'testhash-0001',
          date: '2024-03-05',
          amountCents: -25050,
          counterparty: 'Musterfirma Dienstleistung',
          purpose: 'Testleistung März',
          category: 'NK_UMLEGBAR',
          billingYear: 2024,
          reviewed: false,
          splits: [
            {
              id: 'sp_test001',
              amountCents: -25050,
              costCategoryId: 'k_test001',
              billingYear: 2024,
              note: 'voll zugeordnet',
            },
          ],
        },
      ],
      heatingCircuits: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          billingPeriodId: 'abr_test001',
          heatingSystemId: '66666666-6666-4666-8666-666666666666',
          buildingId: 'B1',
          co2: {
            mode: 'auto',
            co2FactorKgPerKwh: 0.266,
            co2PricePerTonCents: 4500,
          },
          overrides: {
            consumptionSharePercent: 70,
            baseSharePercent: 30,
            operatingElectricitySharePercent: 5,
          },
          hasCentralHotWater: true,
          hotWaterSharePercent: 18,
        },
      ],
      energySources: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          heatingCircuitId: '88888888-8888-4888-8888-888888888888',
          key: 'haupt',
          name: 'Heizöl Haupttank',
          sourceType: 'Heizöl',
          calorificValueKwhPerUnit: 10,
          co2FactorKgPerKwh: 0.266,
        },
      ],
      fuelStocks: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          energySourceId: '77777777-7777-4777-8777-777777777777',
          billingPeriodId: 'abr_test001',
          openingQuantity: { value: 1500, unit: 'l' },
          openingValueCents: 142500,
          openingPricePerUnitCents: 95,
          remainingQuantity: { value: 500, unit: 'l' },
        },
      ],
      fuelDeliveries: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          energySourceId: '77777777-7777-4777-8777-777777777777',
          billingPeriodId: 'abr_test001',
          date: '2024-02-10',
          quantity: { value: 2000, unit: 'l' },
          amountCents: 190000,
          description: 'Lieferung Februar',
          receiptReference: 'L-2024-0001',
        },
      ],
      meterReadings: [],
      meterBillingStatuses: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          meterId: 'sz_test001',
          billingPeriodId: 'abr_test001',
          year: 2024,
          bookingPresent: true,
          annualInvoicePresent: false,
          note: 'Rechnung angefordert',
        },
      ],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          billingPeriodId: 'abr_test001',
          timestamp: '2025-01-15T09:33:20.000Z',
          action: 'Status: Entwurf',
          details: { nutzerAnzahl: 2 },
        },
      ],
    },
  }
}
