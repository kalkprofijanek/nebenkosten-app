# PR 18 – Tabellenorientierter Abrechnungsarbeitsplatz

Verantwortlich: Codex. Finale Freigabe: Mensch.

## Capability

Eine Immobilienkauffrau oder ein Immobilienkaufmann kann die häufigsten
Jahresabrechnungsarbeiten in kompakten, tastaturbedienbaren Tabellen erledigen,
ohne für jeden Datensatz zwischen Karten und langen Formularen zu wechseln.

## Feste Grenzen

- Schema v4, Migration, Core-Berechnung, Rundung, Freigabe- und
  PDF-Snapshot-Verträge bleiben unverändert.
- Geld bleibt ausschließlich als ganze Centwerte gespeichert.
- Schreibende Aktionen verwenden weiterhin die vorhandenen immutable Commands
  und deren vollständige Schema- und Statusprüfung.
- Keine produktiven Daten, Telemetrie, Netzwerkzugriffe oder neuen externen
  UI-Abhängigkeiten.
- `legacy/index.html` bleibt bytegenau unverändert.
- Kritische Aktionen, Snapshots, Import und Wiederherstellung werden nicht
  vereinfacht oder umgangen.

## Umfang

### Gemeinsamer Tabellenrahmen

- kompakte Werkzeugleiste mit Suche, fachlichen Schnellfiltern und Trefferzahl,
- fixierte Tabellenköpfe, rechtsbündige Beträge und sichtbare Summenzeile,
- einheitliche Statuskennzeichnung und eindeutige Primäraktion je Zeile,
- Tastaturnavigation mit Tab, Enter und Escape,
- direkte, zellnahe Fehlermeldungen ohne technische Schema-Pfade,
- Standard- und Kompaktansicht; weiterführende Felder bleiben in Details.

### Buchungen und Kosten

- Buchungen als primäre Arbeitsliste mit Datum, Text, Betrag, Jahr,
  Kostenart, Prüfstatus und Aktion,
- Schnellfilter für offen, ungeprüft und nicht zugeordnet,
- Kostenpositionen als Tabelle mit Kostenart, Datum, Beschreibung, Betrag,
  Beleg-/Buchungsstatus und Abweichungshinweis,
- vorhandene Einzelbearbeitung und centgenaue Splits bleiben erreichbar,
- Filter- und Auswahlzustand darf keine Datenänderung auslösen.

### Nutzer und Nutzerwechsel

- tabellarische Übersicht je Einheit und Nutzungszeitraum mit Person/Leerstand,
  Einzug, Auszug, Fläche, Personen, Vorauszahlung, Kostenbereich und Status,
- vorhandene Validator-Fehler und -Warnungen werden an der betroffenen Zeile
  verständlich markiert,
- vorhandene vollständige Detailbearbeitung bleibt als Seitenpanel/Formular
  erhalten und wird aus der Zeile geöffnet.

### Arbeitsstatus

- dauerhaft sichtbarer Kontext für Objekt, Abrechnungsjahr, Status,
  Speicherzustand und nächsten empfohlenen Schritt,
- Fehler- und Warnungszahlen verlinken auf die bestehende Freigabeprüfung,
- keine zweite, von den Validatoren abweichende Freigabelogik in React.

## Nicht Teil dieses PR

- freie Tabellenformeln, Makros oder Zellbezüge,
- neue Sammeländerungs-Commands oder Schemafelder,
- Änderungen an Heiz-, CO₂-, Rechen- oder PDF-Regeln,
- Cloud-Speicherung, Anmeldung oder Mehrbenutzerbetrieb,
- vollständiger Ersatz aller Detailformulare.

## Erlaubte Pfade

- `apps/web/src/`
- `scripts/verify-deployment-artifact.mjs` (nur geprüfte Bundle-Hashes)
- `tests/e2e/`
- `docs/TASKS/PR-18-TABELLEN-ARBEITSPLATZ.md`
- `docs/TASKS/PR-18-TABELLEN-ARBEITSPLATZ-pr-description.md`

Alle anderen Pfade sind gesperrt. Eine notwendige Erweiterung wird vor der
Änderung ausdrücklich dokumentiert und menschlich entschieden.

## TDD- und Akzeptanzkriterien

1. Tests werden vor der jeweiligen Implementierung ergänzt und schlagen im
   Ausgangsstand wegen der fehlenden Tabellenfähigkeit fehl.
2. Buchungen lassen sich suchen sowie nach offen, ungeprüft und nicht
   zugeordnet filtern; Trefferzahl und gefilterte Summe stimmen.
3. Kostenpositionen und Nutzerzeiträume sind ohne Öffnen einzelner Karten
   vollständig überblickbar und führen gezielt zur vorhandenen Bearbeitung.
4. Enter öffnet die primäre Zeilenaktion, Escape verlässt eine offene
   Detailbearbeitung ohne Datenänderung und Tab folgt der visuellen Reihenfolge.
5. Beträge sind deutsch formatiert, rechtsbündig und werden fachlich niemals in
   React neu berechnet.
6. Bestehende Import-, Buchungs-, Nutzerwechsel-, Berechnungs-, Freigabe-, PDF-
   und Backup-E2E-Abläufe bleiben grün.
7. Neue Komponententests und ein eigener E2E-Praxisablauf verwenden nur
   vollständig fiktive Daten.
8. Web-Coverage bleibt in allen vier Metriken mindestens 80 Prozent.
9. Format, Lint, Typecheck, Tests, Build, Deployment-Artefakt, Privacy-Scan,
   Security-Audit und Legacy-Prüfsumme sind grün.
10. Visuelle Prüfung bei 1440×900, 1024×768 und 390×844 zeigt keine
    Überlagerungen; Tabellen bleiben auf Mobilgeräten kontrolliert scrollbar.

## Rollback

Der PR verändert weder Datenmodell noch gespeicherte Dateien. Er kann
vollständig zurückgenommen werden, ohne Migration oder Datenkonvertierung.
