export interface AppRoute {
  readonly path: string
  readonly label: string
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly actionLabel?: string
}

export const appRoutes = [
  {
    path: '/',
    label: 'Übersicht',
    eyebrow: 'Arbeitsstand',
    title: 'Abrechnung im Blick',
    description:
      'Alle Schritte von den Stammdaten bis zur Freigabe an einem Ort.',
  },
  {
    path: '/firmen',
    label: 'Firmen',
    eyebrow: 'Stammdaten',
    title: 'Firmen verwalten',
    description:
      'Eigentümer und Verwaltungen mit ihren Abrechnungsdaten organisieren.',
    actionLabel: 'Firma anlegen',
  },
  {
    path: '/objekte',
    label: 'Objekte',
    eyebrow: 'Stammdaten',
    title: 'Objekte verwalten',
    description:
      'Liegenschaften, Gebäude und Einheiten eindeutig zusammenführen.',
    actionLabel: 'Objekt anlegen',
  },
  {
    path: '/abrechnungsjahre',
    label: 'Abrechnungsjahre',
    eyebrow: 'Zeitraum',
    title: 'Abrechnungsjahre planen',
    description:
      'Zeiträume anlegen und den Bearbeitungsstatus jederzeit erkennen.',
    actionLabel: 'Abrechnungsjahr anlegen',
  },
  {
    path: '/nutzer',
    label: 'Nutzer',
    eyebrow: 'Nutzung',
    title: 'Nutzer und Wechsel',
    description:
      'Mietzeiträume, Leerstände und Vorauszahlungen nachvollziehbar pflegen.',
    actionLabel: 'Nutzer hinzufügen',
  },
  {
    path: '/kosten',
    label: 'Kosten',
    eyebrow: 'Betriebskosten',
    title: 'Kosten erfassen',
    description:
      'Kostenarten, Belege und Umlageschlüssel strukturiert zusammenstellen.',
    actionLabel: 'Kostenposition anlegen',
  },
  {
    path: '/heizkreise',
    label: 'Heizkreise',
    eyebrow: 'Heizkosten',
    title: 'Heizkreise vorbereiten',
    description:
      'Energiequellen, Lieferungen und Verbrauchswerte vollständig erfassen.',
    actionLabel: 'Heizkreis anlegen',
  },
  {
    path: '/berechnung',
    label: 'Berechnung',
    eyebrow: 'Ergebnis',
    title: 'Abrechnung berechnen',
    description:
      'Die geprüfte Rechenengine verarbeitet die erfassten Angaben reproduzierbar.',
  },
  {
    path: '/freigabe',
    label: 'Freigabe',
    eyebrow: 'Abschluss',
    title: 'Abrechnung freigeben',
    description:
      'Prüfhinweise bearbeiten und den Abschluss kontrolliert vorbereiten.',
  },
  {
    path: '/pdf-export',
    label: 'PDF und Export',
    eyebrow: 'Dokumente',
    title: 'PDF und Export',
    description:
      'Einzelabrechnungen, Gesamtabrechnung und Sammel-ZIP aus dem geprüften Stand erzeugen.',
  },
] as const satisfies readonly AppRoute[]

export function findRoute(path: string): AppRoute {
  return appRoutes.find((route) => route.path === path) ?? appRoutes[0]
}
