# ADR-0014: Fernablesbarkeit und monatliche Verbrauchsinformation

- Status: angenommen (Schritt 1 umgesetzt, Schritte 2 und 3 geplant)
- Datum: 2026-10-21
- Anlass: `docs/KONZEPT-MONATLICHE-VERBRAUCHSINFORMATION.md`,
  Entscheidungen des Nutzers vom 21.10.2026 (Task PR-46)

## Kontext

- § 6a Abs. 1 Satz 1 Nr. 2 HeizKV: Sind fernablesbare Erfassungsgeräte
  eingebaut, sind den Nutzern **seit dem 01.01.2022** monatlich
  Verbrauchsinformationen für Heizung und Warmwasser mitzuteilen
  (Mindestinhalt Abs. 2).
- § 5 Abs. 2 und 3 HeizKV: Nicht fernablesbare Geräte sind bis
  **31.12.2026** nachzurüsten oder zu ersetzen; Ausnahme bei technischer
  Unmöglichkeit oder unbilliger Härte.
- § 12 Abs. 1 Satz 2 und 3 HeizKV: Kürzungsrecht des Mieters um jeweils 3 %.
- Das Regelverzeichnis verknüpfte die Monatsinformation bisher fälschlich mit
  dem Stichtag 2027 (Konzept, Befund 2.1).

Ausgangslage des Nutzers: kein Messdienst; Wärmemengenzähler je Wohnung,
Tausch auf Funk geplant; Warmwasser je Objekt zentral (eigener m³-Zähler je
Wohnung) oder dezentral; Monatswerte künftig als CSV aus der eigenen
Auslesesoftware; Versand gemischt (E-Mail mit Zustimmung, sonst Brief).

## Entscheidung

1. **Option B (App erstellt die Monatsinformation)** in drei Schritten:
   1. Grundlagen: Regelverzeichnis korrigieren, Fernablesbarkeit am Objekt
      erfassen, Prüfhinweise (dieser Schritt).
   2. Monatswerte (CSV) importieren, Monatsverbrauch in kWh, Vergleiche
      Vormonat, Vorjahresmonat und Durchschnittsnutzer.
   3. PDF je Mieter, Versandweg je Mieter (E-Mail/Brief), Versandprotokoll
      als Nachweis.
2. **Schnittstelle (additiv, Schema v5, keine Migration):**
   `Property.remoteReading = { since?: IsoDate, exemptionReason?: string }`.
   `since` = Datum, ab dem alle Wärme-/Warmwasserzähler und
   Heizkostenverteiler des Objekts fernablesbar sind. `exemptionReason` =
   begründete Ausnahme nach § 5 Abs. 3 Satz 2 (nicht leer). Zentrales
   Warmwasser ergibt sich weiterhin aus `HeatingCircuit.hasCentralHotWater`.
3. **Regelverzeichnis:** neue Regel `monthly-consumption-information` (ab
   01.01.2022); `remote-reading` (ab 01.01.2027) nur noch zur Nachrüstpflicht.
4. **Prüfung** (nur Zeiträume mit Heizkreisen):
   - `rules.remote_reading_missing` (**Warnung**): Zeitraum ab 2027 und
     Geräte nicht spätestens zum Beginn des Zeitraums (frühestens 01.01.2027)
     fernablesbar, ohne begründete Ausnahme.
   - `rules.remote_reading_exemption` (Hinweis): Ausnahme erfasst; Beleg
     erforderlich.
   - `rules.monthly_information` (Hinweis): fernablesbar im Zeitraum; Hinweis
     auf die Monatsinformation für Heizung bzw. Heizung und Warmwasser.
   - Der bisherige allgemeine Hinweis `rules.remote_reading` entfällt.
5. **Oberfläche:** zwei optionale Felder im Objekt-Formular.
6. **Schritt 2 – Schnittstelle (additiv, Schema v5, keine Migration):**
   - neue Zählerart `unit_hot_water` (Wohnungs-Warmwasserzähler, m³),
   - `HeatingCircuit.hotWaterMeterAssignments` (`{ meterId, unitId }[]`)
     analog zu `meterAssignments` der Wohnungs-Wärmemengenzähler,
   - Monatsendstände als `MeterReading` (`source: 'imported'`) ohne
     `billingPeriodId`; Monatsendstand = Ablesung am nächsten zum
     Monatsletzten innerhalb von ±3 Tagen.
   - Dateien mit der neuen Zählerart lassen sich mit älteren App-Versionen
     nicht öffnen (wie bei früheren additiven v5-Feldern).

## Begründung der Einstufung

- Warnung statt Fehler bei fehlender Fernablesbarkeit: Die Abrechnung bleibt
  rechnerisch richtig; das Kürzungsrecht ist ein wirtschaftliches Risiko,
  das der Vermieter bewusst bestätigen soll. Zeiträume vor 2027 bleiben
  unberührt.
- Monatsinformation vorerst nur Hinweis: Ein Nachweis (Versandprotokoll)
  folgt mit Schritt 3; erst dann kann die Prüfung Lücken je Monat melden.

## Offene Entscheidungen

- **E-46-1:** Teilweise Fernablesbarkeit (Tausch über mehrere Wochen) wird
  nicht abgebildet; `since` ist das Datum, ab dem **alle** Geräte umgerüstet
  sind.
- **E-46-3:** Durchschnittsnutzer = Mitte der Heizspiegel-Klasse „mittel“
  ((Grenze niedrig + Grenze mittel) ÷ 2, kWh/m²·a), monatlich nach
  Gradtagszahlen; bei Vergleichswerten mit Warmwasser nur Näherung.
- **E-46-4:** Warmwassertemperatur ohne Angabe am Heizkreis: 60 °C,
  gekennzeichnet als Schätzwert.
- **E-46-2:** Ab Schritt 3: fehlende Monatsinformation im Zeitraum als
  Warnung (Vorschlag) oder Fehler?

## Tests

- `packages/schema/tests/remote-reading.test.ts`: optional, ISO-Datum,
  nicht leere Begründung, strikt.
- `packages/validators/tests/legal-rules.test.ts`: Geltungszeiträume beider
  Regeln, Warnung ab 2027, Einbau vor/nach Periodenbeginn, Ausnahme,
  Monatsinformation mit/ohne zentrales Warmwasser, kein Hinweis ohne
  Fernablesung oder bei Einbau nach Periodenende.
