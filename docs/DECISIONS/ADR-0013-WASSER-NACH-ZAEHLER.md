# ADR-0013: Umlageschlüssel „nach Wasserverbrauch“ (§ 556a Abs. 1 Satz 2 BGB)

- Status: vorgeschlagen (Entscheidungen E-45-1 bis E-45-3 offen, Vorgaben
  unten umgesetzt)
- Datum: 2026-10-18
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

## Offene Entscheidungen

- **E-45-1 Kalt- plus Warmwasser (umgesetzt) oder nur Kaltwasser?** Die
  Wasserrechnung umfasst auch das Wasser für die Warmwasserbereitung;
  deshalb zählt der Gesamtverbrauch. Alternative: getrennte Kostenarten.
- **E-45-2 Leerstand im Nenner (umgesetzt)?** Wie bei den Heizkosten trägt
  der Vermieter den Verbrauch leerstehender Wohnungen.
- **E-45-3 Nenner = Summe der Wohnungszähler (umgesetzt)?** Die Differenz
  zum Hauptwasserzähler wird damit anteilig mitverteilt. Alternative:
  Hauptzählerstand als Nenner, Differenz beim Vermieter; eine Prüfregel für
  Abweichungen über einem Schwellenwert ist nicht Teil dieses PR.

## Tests

- `packages/core`: Verteilung nach m³, Leerstand im Nenner, Geltungsbereich
  Gebäude, fehlender Warmwasserwert, Nenner 0.
- `packages/pdf`: Schlüsseltext und eigene Einheiten.
- `packages/validators`: beide Prüfregeln.
- `apps/web`: Auswahl im Kostenart-Formular.

## Migrationsauswirkungen

Keine Datenmigration; Schema-Version bleibt 5. Bestehende Abrechnungen
rechnen unverändert, bis der Nutzer den Schlüssel wählt. Die neue Warnung
erscheint nur, wenn für alle Nutzungen Kaltwasser erfasst ist.
