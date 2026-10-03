import type { ValidationArea } from '@nebenkosten/schema'

interface JourneyStep {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly areas: readonly ValidationArea[]
}
export const billingJourneySteps: readonly JourneyStep[] = [
  {
    title: 'Objekt und Zeitraum',
    description:
      'Prüfe die ausgewählte Liegenschaft, Wohnungen und den Abrechnungszeitraum.',
    path: '/abrechnungsjahre',
    areas: ['master_data', 'billing_period'],
  },
  {
    title: 'Belegung und Vorauszahlungen',
    description:
      'Prüfe jede Wohnung: Nutzerwechsel, Leerstände und Vorauszahlungen müssen zum Abrechnungsjahr passen.',
    path: '/nutzer',
    areas: ['occupancy', 'prepayments'],
  },
  {
    title: 'Heizung und Warmwasser',
    description:
      'Ordne die Heizkreise den Gebäuden zu und prüfe Energiequellen, Warmwasser und Verteilung.',
    path: '/heizkreise?tab=setup',
    areas: ['heating', 'hot_water', 'co2'],
  },
  {
    title: 'Zähler und Verbrauch',
    description:
      'Prüfe Ablesungen und die für jeden Belegungszeitraum erfassten Verbräuche.',
    path: '/heizkreise?tab=meters',
    areas: ['meters'],
  },
  {
    title: 'Energie und Bestand',
    description:
      'Erfasse Anfangsbestand, Lieferungen und Restbestand je Energiequelle. Die Übersicht zeigt den bewerteten Verbrauch.',
    path: '/heizkreise?tab=fuel',
    areas: ['heating'],
  },
  {
    title: 'Kosten und Belege',
    description:
      'Erfasse weitere Heizungs- und Betriebskosten. Prüfe Belege, Buchungen und Umlageschlüssel.',
    path: '/kosten',
    areas: ['costs', 'bookings', 'documents'],
  },
  {
    title: 'Berechnung und Vorschau',
    description:
      'Berechne den aktuellen Stand und kontrolliere Kosten, Vorauszahlungen und Salden je Wohnung und Nutzer.',
    path: '/berechnung',
    areas: ['totals'],
  },
  {
    title: 'Prüfung und Abschluss',
    description:
      'Bearbeite Fehler, bestätige Warnungen und gib den geprüften Stand für die Dokumente frei.',
    path: '/freigabe',
    areas: [],
  },
]
