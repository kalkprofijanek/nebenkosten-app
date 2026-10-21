# PR-46 – Monatliche Verbrauchsinformation (§ 6a HeizKV)

Stand: 21. Oktober 2026. Auftrag: Nutzer, 21.10.2026. Entscheidung:
[ADR-0014](../DECISIONS/ADR-0014-FERNABLESUNG-MONATSINFORMATION.md).

## Entscheidungen des Nutzers (21.10.2026)

| Frage                 | Entscheidung                                                       |
| --------------------- | ------------------------------------------------------------------ |
| Wer erstellt die Info | die App selbst (Option B), Monatswerte per CSV                     |
| Messdienst            | keiner; Ablesung in eigener Regie                                  |
| Heizung               | Wärmemengenzähler je Wohnung, Tausch auf Funk geplant              |
| Warmwasser            | je Objekt zentral (eigener m³-Zähler je Wohnung) oder dezentral    |
| Versand               | gemischt: E-Mail mit Zustimmung, sonst Brief; Weg je Mieter merken |

## Schritt 1 – Grundlagen (dieser PR)

- Regelverzeichnis: `monthly-consumption-information` ab 2022,
  `remote-reading` ab 2027 nur Nachrüstpflicht.
- Schema (additiv, v5): `Property.remoteReading { since, exemptionReason }`.
- Prüfhinweise `rules.remote_reading_missing` (Warnung),
  `rules.remote_reading_exemption`, `rules.monthly_information` (Hinweise).
- Objekt-Formular: „Erfassungsgeräte fernablesbar seit“, „Ausnahme
  (Begründung)“.

Freigegebene Pfade: `packages/schema/`, `packages/validators/`,
`apps/web/src/features/workflows/PropertyRoute*`, `docs/`, `CHANGELOG.md`.

## Schritt 2 – Monatswerte (geplant)

- CSV-Import der Monatsendstände (vorhandener Parser
  `parseMeterServiceCsv`: Zählernummer, Datum, Stand, Einheit `kWh`/`m3`).
- Zuordnung Zählernummer → Wohnung; Monatsverbrauch = Differenz der
  Monatsendstände; Warmwasser m³ → kWh nach § 9 Abs. 2 HeizKV
  (2,5 × V × (tw − 10)).
- Vergleiche: Vormonat, Vorjahresmonat („nicht erhoben“, wenn fehlend),
  Durchschnittsnutzer (Heizspiegel-Jahreswert × Gradtagsanteil des Monats;
  Warmwasser ÷ 12).
- Mieterwechsel im Monat: tagesanteilig, sofern keine Zwischenablesung.

## Schritt 3 – Ausgabe und Nachweis (geplant)

Entscheidungen des Nutzers (21.10.2026):

- **Versandprotokoll: ein Klick je Monat (Variante A).** „Monat versendet
  am …“ protokolliert alle Mieter des Monats mit ihrem hinterlegten Weg;
  Ausnahmen werden einzeln markiert.
- **E-Mail: ein Entwurf je Mieter (mailto), kein BCC an alle.** BCC hätte
  die individuellen Verbrauchswerte aller Mieter offengelegt (Art. 5, 32
  DSGVO) oder keine Information enthalten. mailto kann keine Anhänge
  mitgeben: Die App lädt die PDFs vorher als ZIP; Dateinamen mit Wohnung
  und Monat.
- **Versandweg je Mietverhältnis:** E-Mail nur mit hinterlegter Zustimmung
  und E-Mail-Adresse der Person, sonst Brief (Standard).
- Die App verschickt nichts selbst (CSP `connect-src 'none'`).

Umfang:

- PDF „Verbrauchsinformation <Monat>“ je Mieter (Mindestinhalt § 6a Abs. 2
  HeizKV, Annahmen ausgewiesen), einzeln oder als ZIP.
- Versandliste des Monats: Mieter, Weg, Knopf „E-Mail-Entwurf“ (Betreff
  und Text vorbelegt), Briefe zum Drucken.
- Versandprotokoll je Monat und Mietverhältnis; Prüfung meldet fehlende
  Monate (E-46-2).

## Hinweise an den Nutzer (außerhalb der App)

- Wärmemengen- **und** Warmwasserzähler bis 31.12.2026 auf Funk umrüsten;
  Montageprotokoll mit Datum aufbewahren.
- Beim Tausch verlangen: wM-Bus/OMS, Speicherung der Monatsendstände,
  Auslesesoftware mit CSV-Export.
