/**
 * PDF der monatlichen Verbrauchsinformation (§ 6a Abs. 2 HeizKV, ADR-0014
 * Schritt 3). Alle Daten sind frei erfunden.
 */
import { describe, expect, it } from 'vitest'
import type { Content } from 'pdfmake/interfaces'
import { MissingShippingAddressError } from '../src/contracts'
import {
  buildMonthlyInformationStatement,
  monthlyInformationFileName,
} from '../src/monthly-information-statement'
import { ADDRESS_WINDOW } from '../src/tenant-statement'
import * as pdf from '../src'
import { buildMonthlyContext } from './monthly-information-fixture'

function serialize(
  context: Parameters<typeof buildMonthlyInformationStatement>[0],
): string {
  return JSON.stringify(buildMonthlyInformationStatement(context).content)
}

const MAIL = ['info', 'example.org'].join('@')

describe('buildMonthlyInformationStatement', () => {
  it('ist über den Paketindex exportiert', () => {
    expect(pdf.buildMonthlyInformationStatement).toBe(
      buildMonthlyInformationStatement,
    )
    expect(pdf.monthlyInformationFileName).toBe(monthlyInformationFileName)
  })

  it('setzt Absender und Empfänger in das Fensterkuvert wie die Einzelabrechnung', () => {
    const document = buildMonthlyInformationStatement(buildMonthlyContext())
    const content = document.content as Content[]
    expect(document.pageSize).toBe('A4')
    const returnLine = content.find(
      (item) =>
        typeof item === 'object' &&
        'absolutePosition' in item &&
        item.absolutePosition === ADDRESS_WINDOW.returnLine,
    )
    expect(JSON.stringify(returnLine)).toContain('Muster Hausverwaltung GmbH')
    const recipient = content.find(
      (item) =>
        typeof item === 'object' &&
        'absolutePosition' in item &&
        item.absolutePosition === ADDRESS_WINDOW.recipient,
    )
    const recipientText = JSON.stringify(recipient)
    expect(recipientText).toContain('Erika Beispiel')
    expect(recipientText).toContain(`Postfachweg ${9}`)
    expect(recipientText).toContain('00001 Musterdorf')
    const serialized = JSON.stringify(content)
    expect(serialized).toContain('Sehr geehrte Frau Beispiel,')
    expect(serialized).toContain('03.11.2026')
  })

  it('ergänzt einen Kontaktsatz mit Telefon und E-Mail', () => {
    const context = buildMonthlyContext()
    const withContact = (contact: Record<string, string>) => ({
      ...context,
      appData: {
        ...context.appData,
        masterData: {
          ...context.appData.masterData,
          ownerCompanies: context.appData.masterData.ownerCompanies.map(
            (company) => ({ ...company, contact }),
          ),
        },
      },
    })
    const both = serialize(withContact({ phone: '0000 123456', email: MAIL }))
    expect(both).toContain(
      `Bei Fragen erreichen Sie uns telefonisch unter 0000 123456 oder per E-Mail an ${MAIL}.`,
    )
    const mobileOnly = serialize(withContact({ mobile: '0000 987654' }))
    expect(mobileOnly).toContain(
      'Bei Fragen erreichen Sie uns telefonisch unter 0000 987654.',
    )
    const mailOnly = serialize(withContact({ email: MAIL }))
    expect(mailOnly).toContain(
      `Bei Fragen erreichen Sie uns per E-Mail an ${MAIL}.`,
    )
    const none = serialize(withContact({}))
    expect(none).not.toContain('Bei Fragen erreichen Sie uns')
  })

  it('zeigt Titel, Wohnung, Zeitraum und Heizungsvergleiche', () => {
    const serialized = serialize(buildMonthlyContext())
    expect(serialized).toContain('Verbrauchsinformation Oktober 2026')
    expect(serialized).toContain('Wohnung 3')
    expect(serialized).toContain('01.10.2026 bis 31.10.2026')
    expect(serialized).toContain('Ihr Verbrauch')
    expect(serialized).toContain('1.223 kWh')
    expect(serialized).toContain('Vormonat (September 2026)')
    expect(serialized).toContain('456 kWh')
    expect(serialized).toContain('Gleicher Monat im Vorjahr (Oktober 2025)')
    expect(serialized).toContain('1.234 kWh')
    expect(serialized).toContain('Durchschnittsnutzer')
    expect(serialized).not.toContain('Nutzungszeitraum')
  })

  it('weist Warmwasser in m³ und kWh aus und „nicht erhoben“ mit Grund', () => {
    const context = buildMonthlyContext()
    expect(context.tenant.hotWater).not.toBeNull()
    const serialized = serialize(context)
    expect(serialized).toContain('Warmwasser')
    expect(serialized).toContain('3,25 m³')
    // 2,5 × 3,25 × (55 − 10) = 365,625 → 366 kWh
    expect(serialized).toContain('366 kWh')
    expect(serialized).toContain('nicht erhoben (Zählerstand fehlt)')
    expect(serialized).toContain(
      '2,5 × m³ × (Warmwassertemperatur − 10 °C) mit 55 °C',
    )
    expect(serialized).not.toContain('geschätzt')
  })

  it('lässt Warmwasser ohne zentrale Warmwasserbereitung weg', () => {
    const context = buildMonthlyContext({ hotWater: false })
    expect(context.tenant.hotWater).toBeNull()
    const serialized = serialize(context)
    expect(serialized).not.toContain('m³')
    expect(serialized).not.toContain('Warmwassertemperatur')
    expect(serialized).toContain('Ihren Verbrauch für Heizung im Oktober 2026')
  })

  it('kennzeichnet die geschätzte Warmwassertemperatur und weist Annahmen aus', () => {
    const context = buildMonthlyContext({ temperatureRecorded: false })
    expect(context.tenant.hotWater?.temperatureEstimated).toBe(true)
    const serialized = serialize(context)
    expect(serialized).toContain('Temperatur 60 °C geschätzt')
    // 2,5 × 3,25 × 50 = 406,25 → 406 kWh
    expect(serialized).toContain('406 kWh')
    expect(serialized).toContain('Annahmen')
    expect(serialized).toContain(
      'geschätzt 60 °C (Umrechnung nach § 9 Abs. 2 HeizKV)',
    )
    expect(serialized).toContain('Mitte der Heizspiegel-Klasse')
  })

  it('erläutert den Durchschnittsnutzer mit Quelle und Kategorie', () => {
    const context = buildMonthlyContext()
    const average = context.tenant.averageUser
    expect(average.status).toBe('compared')
    const serialized = serialize(context)
    expect(serialized).toContain('Fiktiver Vergleichsspiegel')
    expect(serialized).toContain('Erdgas, fiktive Kategorie')
    expect(serialized).toContain('Klasse „mittel“')
    expect(serialized).toContain('100 kWh/m² im Jahr')
    expect(serialized).toContain('80 m² beheizte Fläche')
    expect(serialized).toContain('Gradtagszahlen')
    expect(serialized).toContain(`${average.value} kWh`)
    expect(serialized).not.toContain('Näherung')
  })

  it('weist die Näherung bei Vergleichswerten mit Warmwasser aus', () => {
    const context = buildMonthlyContext({ benchmark: 'with_hot_water' })
    const average = context.tenant.averageUser
    expect(average).toMatchObject({ status: 'compared', approximation: true })
    const serialized = serialize(context)
    expect(serialized).toContain('Näherung')
    expect(serialized).toContain('Heizung und Warmwasser zusammen')
    // 1.223 kWh Heizung + 366 kWh Warmwasser
    expect(serialized).toContain('1.589 kWh')
    const withoutOwn = {
      ...context.tenant,
      averageUser: { ...average, ownKwh: null },
    }
    expect(serialize({ ...context, tenant: withoutOwn })).toContain(
      '"Ihr Verbrauch Heizung und Warmwasser (zum Vergleich)",{"text":"nicht erhoben"',
    )
  })

  it('meldet den Durchschnittsnutzer ohne Vergleichswerte als nicht ermittelbar', () => {
    const context = buildMonthlyContext({ benchmark: 'none' })
    const serialized = serialize(context)
    expect(serialized).toContain(
      'nicht ermittelbar (keine Vergleichswerte hinterlegt)',
    )
    expect(serialized).not.toContain('Mitte der Heizspiegel-Klasse')
  })

  it('meldet fehlende Warmwasserenergie bei Vergleichswerten mit Warmwasser', () => {
    const context = buildMonthlyContext({
      benchmark: 'with_hot_water',
      hotWater: false,
    })
    expect(serialize(context)).toContain(
      'nicht ermittelbar (Vergleichswerte enthalten Warmwasser; Ihr Warmwasserverbrauch wird nicht erfasst)',
    )
  })

  it('zeigt bei Teilmonat den Nutzungszeitraum und keine Vormieterwerte', () => {
    const context = buildMonthlyContext({}, 'o-u2')
    expect(context.tenant.from).toBe('2026-10-16')
    const serialized = serialize(context)
    expect(serialized).toContain('Wohnung 4')
    expect(serialized).toContain(
      'Ihr Nutzungszeitraum: 16.10.2026 bis 31.10.2026',
    )
    expect(serialized).toContain('Max Platzhalter')
    // Versandanschrift fehlt am Mietverhältnis → Objektanschrift
    expect(serialized).toContain(`Beispielweg ${5}`)
    expect(serialized).toContain(
      'nicht erhoben (Sie haben die Wohnung in diesem Monat nicht genutzt)',
    )
    expect(serialized).toContain('Gradtagszahlen')
    expect(serialized).toContain('Kalendertagen')
    expect(serialized).toContain('60 m² Wohnfläche')
    // kein Warmwasserzähler in Wohnung 4
    expect(serialized).not.toContain('m³')
  })

  it('kennzeichnet Teilzeiträume in Vergleichswerten', () => {
    const context = buildMonthlyContext()
    const tenant = {
      ...context.tenant,
      heating: {
        ...context.tenant.heating,
        previousMonth: {
          status: 'collected' as const,
          value: 200,
          from: '2026-09-10',
          to: '2026-09-30',
        },
      },
    }
    expect(serialize({ ...context, tenant })).toContain(
      '200 kWh (10.09.2026 bis 30.09.2026)',
    )
  })

  it('beschreibt alle Gründe für nicht erhobene Werte', () => {
    const context = buildMonthlyContext({ hotWater: false })
    const reasons = [
      ['negative_consumption', 'Zählerstand geringer als im Vormonat'],
      ['reading_conflict', 'widersprüchliche Zählerstände'],
      ['meter_not_assigned', 'kein Zähler zugeordnet'],
      ['usage_unknown', 'Nutzung nicht feststellbar'],
    ] as const
    for (const [reason, text] of reasons) {
      const tenant = {
        ...context.tenant,
        heating: {
          ...context.tenant.heating,
          current: { status: 'not_collected' as const, value: null, reason },
        },
      }
      expect(serialize({ ...context, tenant })).toContain(
        `nicht erhoben (${text})`,
      )
    }
  })

  it('meldet fehlende Fläche beim Durchschnittsnutzer', () => {
    const context = buildMonthlyContext()
    const tenant = {
      ...context.tenant,
      averageUser: {
        status: 'unavailable' as const,
        value: null,
        reason: 'area_unknown' as const,
      },
    }
    expect(serialize({ ...context, tenant })).toContain(
      'nicht ermittelbar (Wohnfläche nicht erfasst)',
    )
  })

  it('stellt klar, dass die Information keine Abrechnung ist', () => {
    const serialized = serialize(buildMonthlyContext())
    expect(serialized).toContain('§ 6a')
    expect(serialized).toContain('keine Abrechnung')
    expect(serialized).toContain('Jahresabrechnung')
  })

  it('wirft MissingShippingAddressError ohne verwendbare Anschrift', () => {
    const context = buildMonthlyContext({}, 'o-u2')
    context.appData.masterData.properties[0]!.address = null
    expect(() => buildMonthlyInformationStatement(context)).toThrow(
      MissingShippingAddressError,
    )
  })

  it('meldet fehlende Stammdaten ausdrücklich', () => {
    const context = buildMonthlyContext()
    expect(() =>
      buildMonthlyInformationStatement({
        ...context,
        tenant: { ...context.tenant, tenancyId: null },
      }),
    ).toThrow(/Mietverhältnis/)
    expect(() =>
      buildMonthlyInformationStatement({
        ...context,
        tenant: { ...context.tenant, unitId: 'missing' },
      }),
    ).toThrow(/Einheit/)
    expect(() =>
      buildMonthlyInformationStatement({
        ...context,
        information: { ...context.information, propertyId: 'missing' },
      }),
    ).toThrow(/Objekt/)
    const withoutOwner = buildMonthlyContext()
    withoutOwner.appData.masterData.ownerCompanies = []
    expect(() => buildMonthlyInformationStatement(withoutOwner)).toThrow(
      /Eigentümergesellschaft/,
    )
  })

  it('erzeugt eine Fußzeile mit Absender', () => {
    const document = buildMonthlyInformationStatement(buildMonthlyContext())
    const footer = document.footer as (page: number, count: number) => unknown
    expect(JSON.stringify(footer(1, 1))).toContain('Muster Hausverwaltung GmbH')
  })
})

describe('monthlyInformationFileName', () => {
  it('bildet den Dateinamen aus Monat und Wohnung', () => {
    expect(monthlyInformationFileName('2026-10', 'Wohnung 3')).toBe(
      'Verbrauchsinformation_2026-10_Wohnung-3.pdf',
    )
  })

  it('ersetzt Sonderzeichen durch sichere Zeichen', () => {
    expect(
      monthlyInformationFileName('2026-10', ' Whg. 3/OG – Süd_Straße ä '),
    ).toBe('Verbrauchsinformation_2026-10_Whg-3-OG-Sued-Strasse-ae.pdf')
    expect(monthlyInformationFileName('2026-10', '../..')).toBe(
      'Verbrauchsinformation_2026-10_Einheit.pdf',
    )
    expect(monthlyInformationFileName('2026-10', 'Café')).toBe(
      'Verbrauchsinformation_2026-10_Cafe.pdf',
    )
  })

  it('lehnt ungültige Monate ab', () => {
    expect(() => monthlyInformationFileName('2026-13', 'Wohnung 3')).toThrow(
      /Monat/,
    )
    expect(() => monthlyInformationFileName('../x', 'Wohnung 3')).toThrow(
      /Monat/,
    )
  })
})
