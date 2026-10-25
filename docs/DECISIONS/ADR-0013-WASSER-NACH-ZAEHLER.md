# ADR-0013: Umlageschlüssel „nach Wasserverbrauch“ (§ 556a Abs. 1 Satz 2 BGB)

- Status: angenommen (E-45-1 bis E-45-3 vom Maintainer am 25.10.2026 wie
  vorgeschlagen entschieden; Prüfschwelle Hauptwasserzähler 15 %)
- Datum: 2026-10-18, ergänzt 2026-10-25
- Anlass: PR-44 (Musterabrechnungen). Die App kannte keinen Schlüssel nach
  gemessenem Wasserverbrauch; Wasserkosten ließen sich nur nach Fläche,
  Wohneinheiten oder HKV-Einheiten verteilen.

## Kontext

Betriebskosten, die von einem erfassten Verbrauch abhängen, sind nach
§ 556a Abs. 1 Satz 2 BGB nach diesem Verbrauch umzulegen. Sind
Wohnungswasserzähler eingebaut, gilt das für Wasserversorgung und
Entwässerung (§ 2 Nr. 2 und 3 BetrKV). Die Ablesewerte je Nutzung erfasst die
App bereits (`OccupancyPeriod.coldWater`, `OccupancyPeriod.warmWater`, m³,
Seite **Verbrauch**), sie flossen aber in keine Verteilung ein.

## Entscheidung

1. **Schnittstelle (additiv, Schema v5, keine Migration):** neuer Wert
   `water_consumption` in `allocationKeySchema`. Bestehende Dateien bleiben
   gültig. Dateien mit dem neuen Wert lassen sich mit älteren App-Versionen
   nicht öffnen (wie bei früheren additiven v5-Feldern).
2. **Rechenvertrag** (`packages/core`):
   - Wasserverbrauch einer Nutzung = `coldWater` + `warmWater` in m³
     (fehlender Warmwasserwert = 0).
   - Anteil = umlagefähiger Betrag ÷ Summe der Wasserverbräuche aller
     Nutzungen im Geltungsbereich × eigener Wasserverbrauch, **ohne**
     Zeitfaktor (der Zählerwert gilt bereits für den Nutzungszeitraum).
   - Leerstandszeiträume zählen im Nenner mit; ihren Anteil trägt der
     Vermieter.
   - `TenantAllocationBasis.waterM3` (optional) und Nenner `m³` im Trace für
     die Einzelabrechnung.
3. **PDF:** Schlüssel „nach Wasserverbrauch“, eigene Einheiten „x m³“.
4. **Prüfung** (`packages/validators`):
   - Fehler `costs.water_consumption_missing`: Kostenart mit diesem
     Schlüssel, aber eine Nutzung im Geltungsbereich ohne Kaltwasserwert.
   - Warnung `costs.water_meter_not_used`: Kostenart vom Typ `water` nach
     Fläche oder Wohneinheiten, obwohl für alle Nutzungen im
     Geltungsbereich Kaltwasser erfasst ist.
5. **Oberfläche:** Schlüssel in allen Kostenart-Formularen und Übersichten.
6. **Abgleich mit dem Hauptwasserzähler (Ergänzung 25.10.2026, E-45-3):**
   - Schnittstelle (additiv, Schema v5, keine Migration): optionales Feld
     `CostCategory.mainWaterMeterM3` (Verbrauch laut Hauptwasserzähler im
     Abrechnungszeitraum in m³, > 0). Das Feld dient nur der Prüfung; die
     Verteilung bleibt unverändert. Es wird **nicht** ins Folgejahr
     übernommen, weil der Wert jahresbezogen ist.
   - Warnung `costs.water_main_meter_difference`: Kostenart mit Schlüssel
     `water_consumption`, Hauptzählerwert erfasst, Kaltwasser für alle
     Nutzungen im Geltungsbereich erfasst und
     |Hauptzähler − Summe (Kalt- + Warmwasser) der Nutzungen| ÷ Hauptzähler
     **größer als 15 %**. Genau 15 % löst keine Warnung aus. Die Richtung
     ist gleichgültig: Auch eine Summe über dem Hauptzähler deutet auf
     Ablese- oder Zuordnungsfehler hin.
   - Oberfläche: Feld „Verbrauch laut Hauptwasserzähler in m³ (optional)“
     an Kostenarten vom Typ „Wasser“.

## Entscheidungen (Maintainer, 25.10.2026)

- **E-45-1 Kalt- plus Warmwasser: angenommen.** Die Wasserrechnung umfasst
  auch das Wasser für die Warmwasserbereitung; deshalb zählt der
  Gesamtverbrauch. Verworfen: getrennte Kostenarten.
- **E-45-2 Leerstand im Nenner: angenommen.** Wie bei den Heizkosten trägt
  der Vermieter den Verbrauch leerstehender Wohnungen.
- **E-45-3 Nenner = Summe der Wohnungszähler: angenommen.** Die Differenz
  zum Hauptwasserzähler wird anteilig mitverteilt. Verworfen: Hauptzähler
  als Nenner mit Differenz beim Vermieter. Abgesichert durch die Warnung ab
  einer Abweichung über 15 % (Nr. 6).

## Offene Punkte

- Die 15-%-Schwelle ist eine Entscheidung des Maintainers, keine aus
  Gesetz oder Rechtsprechung abgeleitete Grenze. Sie ist als Konstante
  `MAIN_WATER_METER_TOLERANCE_PERCENT` in
  `packages/validators/src/static-validation.ts` hinterlegt.
- Der Hauptzählerwert muss für denselben Zeitraum gelten wie die
  Wohnungszähler; weichen die Ablesetage ab, prüft die App das nicht.

## Tests

- `packages/core`: Verteilung nach m³, Leerstand im Nenner, Geltungsbereich
  Gebäude, fehlender Warmwasserwert, Nenner 0.
- `packages/pdf`: Schlüsseltext und eigene Einheiten.
- `packages/validators`: beide Prüfregeln; Hauptzählerabgleich mit
  Abweichung nach unten und oben, Grenzwert genau 15 %, ohne Hauptzähler,
  anderer Schlüssel, fehlende Kaltwasserwerte
  (`tests/water-consumption.test.ts`).
- `packages/schema`: `mainWaterMeterM3` optional, nur positive endliche
  Zahlen (`tests/main-water-meter.test.ts`).
- `apps/web`: Auswahl im Kostenart-Formular; Hauptzählerfeld nur bei Typ
  „Wasser“, Dezimalkomma, Entfernen mit leerem Feld
  (`src/features/workflows/costs/main-water-meter.test.tsx`).

## Migrationsauswirkungen

Keine Datenmigration; Schema-Version bleibt 5. Bestehende Abrechnungen
rechnen unverändert, bis der Nutzer den Schlüssel wählt. Die neue Warnung
erscheint nur, wenn für alle Nutzungen Kaltwasser erfasst ist. Die
Warnung zum Hauptwasserzähler erscheint nur, wenn der Hauptzählerwert
eingetragen ist. Dateien mit `mainWaterMeterM3` lassen sich mit älteren
App-Versionen nicht öffnen (wie bei früheren additiven v5-Feldern).
