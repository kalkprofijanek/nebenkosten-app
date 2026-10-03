# Wohnungswärme aus Ablesungen

Stand: 3. Oktober 2026. Ausgangspunkt: PR 21, Commit b5d374b.
Der Nutzer hat Schema-Version 5 mit sicherer Migration und automatischer
Zuordnung ausschließlich bei vollständigen, eindeutigen Ablesungen freigegeben.

## Fähigkeit und Grenzen

Die Verwaltung ordnet ausdrücklich als Wohnungs-Wärmemengenzähler bezeichnete
Geräte einem Heizkreis und einer Wohnung für das ausgewählte Jahr zu. Der
Assistent zeigt den Rechenweg von den Grenzablesungen zu den Nutzerzeiträumen.
Erst nach bewusster Aktivierung am Heizkreis verwendet die Berechnung diese
Messwerte. Bestehende manuelle HKV-Einheiten werden nicht überschrieben.

Der erste Umfang unterstützt kWh, ganzjährig unverändert zugeordnete Geräte und
vollständige Nutzer- beziehungsweise Leerstandszeiträume. Mehrere kompatible
Wohnungszähler dürfen summiert werden. Versorgungsstrom, Brennstoffzähler,
Heizkostenverteiler, Warmwasserzähler, Bewertungsfaktoren, Interpolation,
automatische Schätzungen, Zählerwechsel und Überläufe sind nicht enthalten.
Solche Fälle bleiben zur manuellen Klärung offen. Es gibt keine stille
Umwandlung von kWh in HKV-Einheiten.

## Verbindliche Bestandsbedingungen

- Lokale Verarbeitung, ausschließlich fiktive Testdaten; kein Push/Deployment.
- Legacy unverändert; bestehende manuelle Berechnungen bleiben reproduzierbar.
- Keine Ableitung der Wohnung aus Nummern, Notizen oder Adressen.
- Ein geänderter Ablesewert darf einen freigegebenen Stand nicht verändern.
- Fachliche Berechnung ist unabhängig von React und speichert keinen UI-Zustand.
- Fehlend ist nicht null Verbrauch. Null ist bei zwei gleichen Ständen gültig.
- Kein gemischter Nenner aus kWh und HKV-Einheiten.

## Datenvertrag für Version 5

Neue Angaben sind explizit und optional für bestehende Bestände:

- Geräteart `unit_heat` für Wohnungswärme; vorhandene `general`/`heat` bleiben
  unverändert und sind nicht automatisch Wohnungszähler.
- Heizkreis: `consumptionMode` (`manual` oder `metered_kwh`) und jährliche
  `meterAssignments` mit `meterId` und `unitId`. Fehlender Modus bedeutet den
  unveränderten manuellen Rechenweg. Neue Zuordnungen gelten für das ganze Jahr.
- Ablesung: `boundary` (`start_of_day` oder `end_of_day`). Ohne diese ausdrückliche
  Angabe darf ein alter Datumswert nicht als Periodengrenze interpretiert werden.
- Jede automatisch verwendete Ablesung braucht Zähler, Jahr, Datum und kWh-Wert.
  Eine Ablesung ohne Jahr wird nicht in mehrere Jahre übernommen.

Die reine Verbrauchsermittlung liefert Zuordnungen, Teilverbräuche und einen
Trace mit Zähler-/Ablese-IDs, Zeiträumen, Werten und Einheiten oder konkrete
Prüfprobleme. Sie verändert weder Ablesungen noch manuelle Verbrauchswerte.
Die Kostenberechnung darf im aktivierten Messmodus bei unvollständigem Ergebnis
nicht auf manuelle Werte oder null zurückfallen.

## Grenzvertrag und Beispiele

Belegungen gelten wie bisher mit inklusive angegebenem Anfangs- und Enddatum.
Intern entsprechen sie dem Intervall vom Tagesanfang `from` bis zum Tagesanfang
nach `to`. Eine bestätigte Endablesung am 30.06. ist damit dieselbe Grenze wie
eine bestätigte Anfangsablesung am 01.07.; beides gleichzeitig ist mehrdeutig
und muss bereinigt werden. Eine bloße Datumsablesung ohne Grenzrolle genügt nicht.

| Grenze                 |     Stand | Verwendung                 |
| ---------------------- | --------: | -------------------------- |
| 01.01.2026 Tagesanfang | 1.000 kWh | Beginn Nutzer A            |
| 30.06.2026 Tagesende   | 1.400 kWh | Ende A, Beginn B am 01.07. |
| 31.12.2026 Tagesende   | 2.000 kWh | Ende Nutzer B              |

A erhält 400 kWh, B 600 kWh. Die Summe ist 1.000 kWh. Ohne mittlere Ablesung
ist keine automatische Aufteilung möglich. Eine Änderung des Endstands auf
2.100 kWh ergibt 400 und 700 kWh, solange das Jahr bearbeitbar ist.

Für Jahresgrenzen kann ausdrücklich der Vorjahresletzte am Tagesende oder
der Folgejahreserste am Tagesanfang verwendet werden; das Ablesungsjahr bleibt
das zu prüfende Jahr. Andere außerhalb liegende Ablesungen bleiben ungültig.

Leerstandsverbrauch wird separat dem bereits vorhandenen Vermieterpfad
zugeordnet. Der neue Messmodus muss ihn auch im Verbrauchsnenner berücksichtigen:
900 kWh Mieter plus 100 kWh Leerstand ergibt 1.000 kWh, nicht 900 kWh.
Dieser neue Nenner gilt nur für den aktivierten Wärme-Messmodus; allgemeine
Kostenarten mit manuellem Verbrauchsschlüssel werden dadurch nicht verändert.
Der unveränderte Bestandsweg schließt Leerstandsverbrauch aus dem Nenner aus
(`calculate-billing.ts`, `buildAllocationBasis`) und darf daher nicht einfach
mit neuen Messwerten befüllt werden.

## Migration und Wiederherstellung

Das bisherige strikte v4-Schema muss als eigener Importvertrag erhalten bleiben.
Migration v4 → v5 bewahrt Daten, IDs, manuelle Werte, Status, Dokumente und
historische Berechnungssnapshots. Neue Messfunktionen bleiben deaktiviert.
V3 wird weiterhin unterstützt. Unbekannte neuere Versionen bleiben gesperrt.
Es werden keine produktiven Bestände während der Entwicklung umgestellt.

Vor Übernahme muss eine wiederherstellbare Quelle vorhanden sein. Revisionen
beziehen sich auf tatsächliche Quellbytes, nicht auf still neu serialisierte
Migrationsdaten. Laden darf die Quelldatei nicht überschreiben. Import und
bereits lokal gespeicherte Bestände müssen beide berücksichtigt werden.

## Umsetzung und Verantwortung

Hauptagent implementiert und integriert auf `codex/metered-consumption-v5`.
Zwei abgegrenzte Subagenten bearbeiten Schema/Speicherung beziehungsweise
Core/Validatoren in eigenen Worktrees. Neue Teilaufgaben verwenden gemäß
Nutzerwunsch `gpt-6-luna` mit niedrigem Denkaufwand; der Hauptagent integriert
und prüft die Ergebnisse. Betroffen sind `packages/schema`,
`packages/import-export`, `packages/persistence`, `packages/core`,
`packages/validators`, `packages/pdf`, `apps/web`, Tests und bestehende Doku.
Keine neue externe Verbindung, kein Hosting und keine Änderung an Legacy.

Reihenfolge: Schema/Migration → reine Verbrauchsermittlung → gesonderter
Heizverbrauchspfad → Eingaben/Vorschau → Freigabe/Snapshots/PDF → Gesamtabnahme.

## Abnahmetests vor Implementierung

- V4 mit allen vorhandenen Daten → V5 → Export/Import ohne Datenverlust;
  Rücksicherung der V4-Quelle, unbekannte Felder und neuere Versionen blockieren.
- Bestehende manuelle Charakterisierungsfälle bleiben unverändert.
- 400 + 600 = 1.000 kWh, mehrere Geräte, Schaltjahr und Teiljahr, echter Nullwert.
- Fehlende/doppelte Grenze, fallender Stand, Schätzung, falsches Jahr/Objekt,
  Einheitenwechsel, fehlende Zuordnung und unvollständige Belegung blockieren.
- Leerstand mit eigenem gemessenem Verbrauch: Nenner und Kostensummen stimmen.
- Manuelle HKV-Werte bleiben erhalten; andere Verbrauchskosten unverändert.
- Korrektur berechnet neu; gesperrtes Jahr bleibt gesperrt; historische PDFs
  verwenden weiterhin ihre unveränderten Snapshots.
- UI und vollständiger Browserablauf bei Desktopbreite (Mobil entfällt seit
  ADR-0002).
- Format, Lint, Typen, Unit/Integration/Migration/Charakterisierung, mindestens
  80 % Abdeckung, Build, Datenschutz, Guardrails und Abhängigkeitsaudit.

## Status

Lokal umgesetzt: Schema 5, bestätigte V4-Migration mit atomarer Sicherung der
Originalbytes, schreibgeschützte V4-Rücksicherung, Zählerzuordnung,
Grenzablesungen, Verbrauchsvorschau und Messnachweis im gespeicherten PDF-Stand.
Fehlende oder mehrdeutige Werte sperren die Messberechnung. Der Mischbetrieb
mit manuellen Heizkreisen und die Verbrauchsanteile von Leerständen sind geprüft.

Abnahme am 3. Oktober 2026:

- 396 Oberflächen-, 171 Schema-, 44 Import-/Export-, 83 Persistenz-, 354 Core-,
  31 Validator-, 43 PDF- und 23 Paket-Abnahmetests bestanden.
- 18 Integrationstests, 10 Migrationstests und 258 Charakterisierungsfälle bestanden.
- Abdeckung: Oberfläche 90,02 % Statements / 81,4 % Branches; Core 94,05 % /
  82,63 %; Persistenz 90,2 % / 84,39 %; Validatoren 93,33 % / 83,41 %.
- 28 Browserfälle geprüft: zunächst 26 bestanden; zwei veraltete Testannahmen
  korrigiert und die betroffenen Dateien erfolgreich erneut geprüft (3 Tests).
  Die gezielte Gruppe für Messverbrauch und Heizablauf bestand zusätzlich 8/8.
- Desktop (1440 px) und Mobilansicht (390 px) visuell geprüft; kein horizontaler
  Seitenüberlauf. Zuordnung, Nutzerwechsel, Korrektur und Neuladen funktionieren.
- Format, Lint, Typprüfung, Build, Datenschutz, Repository- und Artefaktprüfung
  sowie Sicherheitsprüfung gehören zur abschließenden CI-Prüfkette.
- Sicherheitskorrekturen für Undici 8.10.2 und brace-expansion ab 5.0.12;
  Abhängigkeitsscan ohne bekannte Schwachstellen.
- Zusätzliche unabhängige Prüfung von Migration, Berechnung und Oberfläche:
  ein Wiederherstellungskonflikt behoben und durch Regressionstest abgesichert;
  danach keine konkreten hohen oder mittleren Befunde.

### Nachtrag: Fehlerführung zur Korrekturstelle

Befund nach 5a00653: Gesperrte Messwerte waren nicht dort sichtbar, wo sie
korrigiert werden. Der Validator meldete alle `metered.*`-Probleme im Bereich
`heating`; der geführte Ablauf zeigte sie deshalb unter „Heizung und
Warmwasser“ und „Energie und Bestand“, nicht unter „Zähler und Verbrauch“. Der
Korrekturlink führte zum Heizkreis-Reiter, Probleme mit Wohnungsbezug verdeckten
den Zähler, und „Abrechnung berechnen“ zeigte die technische Core-Meldung mit
Codes und IDs. Die Vorschau im Zählerbereich listete auch fremde Heizkreise.

Umgesetzt, ohne Änderung von Schema, Rechenweg oder Sperrwirkung:

- Lücken, Überschneidungen, ungültige oder fehlende Nutzerzeiträume erscheinen
  im Bereich `occupancy` und führen zu `#/nutzer?edit=<Nutzerzeitraum>`.
- Ablese-, Zähler- und Zuordnungsprobleme erscheinen im Bereich `meters`; mit
  Zählerbezug führt der Link zu `#/heizkreise?tab=meters&meter=<Zähler>`, der
  Zählerbereich wählt diesen Zähler aus und scrollt zu ihm.
- Prüfhinweise nennen Zählernummer und Wohnung im Klartext.
- Eine gesperrte Berechnung zeigt dieselben Prüfhinweise mit Korrekturlinks
  statt der technischen Meldung; andere Berechnungsfehler bleiben unverändert.
- Die Verbrauchsvorschau zeigt nur Probleme des gewählten Heizkreises, jeweils
  mit Weg zum Nutzerzeitraum oder zu den Ablesungen.

Abnahmekriterien und Nachweis (lokal ausgeführt):

- Neue Validatortests (`packages/validators/tests/metered-validation.test.ts`):
  Bereich, Entität und Klartext für Ablese-, Lücken-, Belegungs- und
  Zuordnungsprobleme; vor der Umsetzung vier von sechs Fällen rot.
- Oberflächentests für Linkziele, Zählerauswahl per Link, gefilterte Vorschau,
  Zählerschritt im geführten Ablauf und gesperrte Berechnung.
- Browserfall „gesperrte Messberechnung führt zur Ablesung“ bei 1440 px und
  390 px ohne horizontalen Überlauf; die Messverbrauchs- und Heizungsgruppe
  bestand 6/6.
- `pnpm run ci`: Format, Lint, Typen, 404 Oberflächen-, 354 Core-, 171 Schema-,
  83 Persistenz-, 43 PDF-, 44 Import-/Export-, 37 Validator- und 23
  Paket-Abnahmetests, 18 Integrations-, 10 Migrations- und 258
  Charakterisierungsfälle bestanden; Abdeckung Oberfläche 90,11 % / 81,64 %,
  Validatoren 95,13 % / 84,74 %; Build und Artefaktprüfung bestanden. Die
  Repository-Prüfung scheiterte nur an Gits Besitzerprüfung des Ordners und
  bestand mit prozessweiser `safe.directory`-Ausnahme, ebenso Inhaltsscan und
  Abhängigkeitsaudit (keine bekannten Schwachstellen).

### Nachtrag: Praxistest mit lokalem Bestand

Ein lokaler Durchlauf einer produktiven v3-Sicherung (nur unter `private-data/`,
nicht im Git; Auswertung ausschließlich mit Codes und Anzahlen) zeigte eine stille
Fehlzuordnung: Wohnungen eines Gebäudes erhielten kein Gebäude, weil das
Mandatspräfix in der Alt-App anders geschrieben war als die Hausschlüssel. Die
Berechnung lief dennoch ohne Warnung durch; die Heizkosten dieses Gebäudes wären
nicht auf seine Nutzer verteilt worden.

Korrigiert:

- Import: Exakte Präfixtreffer haben weiter Vorrang, die Trennzeichenregel bleibt.
  Nur ohne exakten Treffer gilt die Schreibweise der Alt-App (`normScopeKey`:
  Großschreibung), und nur bei genau einem passenden Gebäude.
- Import meldet verbleibende Wohnungen ohne Gebäude als
  `migration.unit_building_unresolved`.
- Prüfung: `master_data.unit_building_missing` und
  `heating.circuit_without_units` sperren die Freigabe;
  `heating.consumption_units_missing` verlangt bei Mietern ohne oder mit 0
  Verbrauchseinheiten in einem manuellen Heizkreis mit Heizkosten eine bewusste
  Bestätigung und verlinkt auf den Nutzerzeitraum.

Offen und fachlich zu entscheiden: fehlende Versandanschriften sind im Bestand
der größte Freigabeblocker (Objektanschrift als Vorgabe?); mögliche
Doppelbuchungen gleicher Kostenart, gleichen Betrags und Datums haben noch keine
Prüfregel. Der Bestand nutzt Heizkostenverteiler; der kWh-Messpfad ist dafür
nicht vorgesehen, eine Erweiterung steht daher zurück.

### Nachtrag: Versandanschrift als Vorgabe

Nutzerentscheidung: Wer am Periodenende noch in der Wohnung wohnt und keine
eigene Versandanschrift hat, erhält automatisch die Hausanschrift der Wohnung
(aus den übernommenen Legacy-Feldern Straße/Hausnummer) bzw. die Objektstraße,
jeweils mit PLZ/Ort des Objekts. Eine erfasste Anschrift hat Vorrang. Nach
einer weiteren Nutzerentscheidung gilt das auch nach einem Auszug, weil eine
neue Anschrift nicht immer bekannt ist; die Prüfung meldet dann nur den Hinweis
`occupancy.shipping_address_previous`. `occupancy.shipping_address_missing`
bleibt ein Fehler, wenn gar keine Anschrift mit PLZ/Ort verfügbar ist. Prüfung
und PDF verwenden dieselbe Funktion `resolveShippingAddress` aus dem Core.

Brennstoffmengen im Praxisbestand: Die betroffenen Legacy-Lieferungen haben
Menge 0 mit uneindeutiger Einheit („l/kg“, „Einheit“). Der Import übernimmt sie
bewusst nicht als Nullmenge (fehlend ist nicht null); die Mengen werden in der
App aus den Rechnungen nachgetragen.

### Nachtrag: nur Desktop

Laut Nutzerentscheidung ist die App ausschließlich für Desktop-Browser bestimmt
([ADR-0002](../DECISIONS/ADR-0002-DESKTOP-ONLY.md)). Die Mobilvarianten der
Browsertests (390 px) wurden entfernt; frühere Mobilangaben oben sind nur noch
historischer Nachweis.

Legacy-Datei unverändert. Nach Freigabe als Pull Request #46 veröffentlicht;
kein Merge ohne ausdrückliche Freigabe.
Der wiederverwendbare Arbeitsauftrag steht in
[SUBAGENTEN-SPARSAM-PROMPT.md](SUBAGENTEN-SPARSAM-PROMPT.md).
