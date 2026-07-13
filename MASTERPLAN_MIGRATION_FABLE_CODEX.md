# Masterplan: Umzug der Nebenkosten-App und parallele Entwicklung mit Claude und Codex GPT-5.6

Stand: 11. Juli 2026  
Zweck: Verbindliche Arbeits-, Migrations- und Review-Anweisung für den kontrollierten Umbau der bestehenden Single-File-Anwendung `index.html` in eine allgemein nutzbare, wartbare und über GitHub entwickelte Web-Anwendung.

---

## 1. Ziel

Die bestehende Nebenkostenabrechnungs-App wird schrittweise aus einer einzelnen, selbstenthaltenen `index.html` in eine modular aufgebaute TypeScript-Webanwendung überführt.

Der Umbau darf keine fachlich funktionierende Bestandsfunktion stillschweigend verlieren. Die neue Anwendung soll:

- mehrere Eigentümer bzw. Verwalter unterstützen,
- mehrere Liegenschaften, Gebäude, Einheiten und Abrechnungsjahre verwalten,
- die bestehende Abrechnungs-, Heizkosten- und CO₂-Logik nachvollziehbar abbilden,
- bestehende JSON-Daten der Schema-Version 3 übernehmen,
- lokal und datenschutzgerecht funktionieren,
- später um Benutzerkonten, Mandantentrennung und serverseitige Speicherung ergänzt werden können,
- automatisiert getestet, gebaut und über GitHub weiterentwickelt werden,
- von Claude und Codex GPT-5.6 parallel bearbeitet und gegenseitig geprüft werden können.

GitHub ist die gemeinsame Quelle für Code, Dokumentation, Issues, Pull Requests, Tests, Releases und Deployment. Echte Mieter-, Eigentümer-, Bank-, Verbrauchs-, Abrechnungs- oder Belegdaten werden nicht in GitHub gespeichert.

---

## 2. Verbindliche Grundsätze

### 2.1 Keine Neuentwicklung ohne Bestandsaufnahme

Die vorhandene `index.html` ist der fachliche Referenzbestand. Vor dem Umbau sind Funktionen, Datenfelder, Berechnungswege, Prüfungen, Import-/Exportfunktionen und PDF-Ausgaben vollständig zu inventarisieren.

Der Bestand wird zunächst unverändert unter folgendem Pfad gesichert:

```text
legacy/index.html
```

Die alte App bleibt während der Migration lauffähig und dient als Vergleichssystem.

### 2.2 Keine echten Daten in GitHub

Nicht einchecken:

- `nk-daten.json`
- Exporte aus der produktiven App
- Namen, Anschriften oder E-Mail-Adressen von Mietern
- IBAN, Bankverbindungen oder Zahlungsdaten
- Rechnungen und Belege
- Zählernummern und echte Verbrauchsdaten
- nicht anonymisierte Abrechnungen
- Objektunterlagen, Energieausweise oder technische Dokumentationen mit produktivem Bezug
- OneDrive-Dateien oder lokale Sicherungen

Lokale Ablage:

```text
private-data/
private-data/import/
private-data/export/
private-data/documents/
private-data/backups/
```

Diese Verzeichnisse müssen vollständig in `.gitignore` stehen.

Die vorhandenen Referenzunterlagen, beispielsweise:

```text
Beschreibung TT-2-3.pdf
Allgemeine Beschreibung.pdf
TT 1-3EnEV 16.pdf
TT-LL8-10-Energie- Energieausweis_GEG.pdf
TT-LL12-16-Energie- Energieausweis_GEG.pdf
VA TT-LL18-22_Energieausweis_EnEV_2013.pdf
```

bleiben lokal unter `private-data/documents/`. Für automatisierte Tests dürfen daraus nur vollständig anonymisierte, fachlich erforderliche Testwerte in separate Fixtures übernommen werden.

### 2.3 Keine parallele Bearbeitung desselben Arbeitsverzeichnisses

Claude und Codex arbeiten niemals gleichzeitig im selben Ordner. Jeder Agent erhält:

- einen eigenen Git-Branch,
- einen eigenen Git-Worktree,
- ein klar abgegrenztes Arbeitspaket,
- eine festgelegte Dateiverantwortung.

### 2.4 Kein direkter Push auf `main`

`main` bleibt geschützt. Änderungen gelangen ausschließlich über Pull Requests in den Hauptstand.

### 2.5 Fachliche Berechnungen sind deterministisch

Die Rechenlogik darf nicht von UI, DOM, Browserzustand oder zufälliger Reihenfolge abhängen.

Geldbeträge werden intern in Cent gespeichert. Prozentsätze, Mengen und Verbrauchswerte werden mit einer festgelegten Dezimalstrategie verarbeitet. Rundungen erfolgen nur an dokumentierten Stellen.

### 2.6 Migration vor Erweiterung

Zuerst muss die bestehende Funktionalität reproduzierbar in der neuen Struktur laufen. Neue Produktfunktionen werden erst danach umgesetzt.

### 2.7 Automatisches Review, manueller Merge

Programmierung, Tests, Push, Pull-Request-Erstellung und gegenseitiges Review dürfen automatisiert werden. Der endgültige Merge in `main` bleibt zunächst eine manuelle Entscheidung.

---

## 3. Ausgangsbestand

Die bestehende Anwendung ist eine selbstenthaltene Browser-App mit HTML, CSS und JavaScript in einer Datei. Sie enthält insbesondere:

- Eigentümer-/Firmenverwaltung,
- Objekt- und Liegenschaftsverwaltung,
- mehrere Abrechnungsjahre je Objekt,
- Nutzer und Nutzerwechsel,
- Kostenarten und Umlageschlüssel,
- Buchungszuordnung,
- Heizkreise und Energiequellen,
- Anfangsbestand, Lieferungen, Restbestand und FIFO-Bewertung,
- Heizkostenverteilung,
- zentrale und dezentrale Warmwasserlogik,
- CO₂-Berechnung und Vermieter-/Mieteranteil,
- Vorauszahlungen,
- Abrechnungsergebnisse und Kontrollsummen,
- formelle und fachliche Freigabeprüfungen,
- PDF-Ausgabe,
- JSON-Import und JSON-Export,
- lokale Speicherung,
- IndexedDB-Snapshots,
- Dateihandle-/OneDrive-orientiertes Speichern,
- Konflikt- und Versionsschutz,
- Schema-Version 3.

Diese Funktionen sind als Migrationsumfang zu behandeln. Eine Bestandsfunktion darf nur entfernt werden, wenn dies in einem eigenen Pull Request ausdrücklich begründet, dokumentiert und freigegeben wird.

---

## 4. Zielarchitektur

### 4.1 Technischer Zielzustand

Empfohlener Grundaufbau:

- TypeScript
- Vite
- React
- pnpm Workspaces
- Zod oder gleichwertige Laufzeitvalidierung
- Vitest für Unit- und Integrationstests
- Playwright für End-to-End-Tests
- ESLint
- Prettier
- IndexedDB über einen klar gekapselten Storage-Adapter
- PDF-Erzeugung in einem separaten Paket
- JSON-Import/-Export über versionierte Schema-Migrationen
- GitHub Actions für Tests, Build und Deployment

React ist nur die UI-Schicht. Die fachliche Logik liegt außerhalb der React-Komponenten.

### 4.2 Zielstruktur des Repositorys

```text
nebenkosten-app/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
├── SECURITY.md
├── CONTRIBUTING.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .editorconfig
├── .gitignore
├── .env.example
│
├── apps/
│   └── web/
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/
│       │   ├── app/
│       │   ├── pages/
│       │   ├── features/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── routes/
│       │   ├── styles/
│       │   └── main.tsx
│       └── tests/
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── calculation/
│   │   │   ├── allocation/
│   │   │   ├── heating/
│   │   │   ├── co2/
│   │   │   ├── periods/
│   │   │   ├── rounding/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── schema/
│   │   ├── src/
│   │   │   ├── entities/
│   │   │   ├── versions/
│   │   │   ├── migrations/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── validators/
│   │   ├── src/
│   │   │   ├── formal/
│   │   │   ├── legal/
│   │   │   ├── plausibility/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── persistence/
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   ├── indexed-db/
│   │   │   ├── file-system/
│   │   │   ├── memory/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── import-export/
│   │   ├── src/
│   │   │   ├── json/
│   │   │   ├── legacy-v3/
│   │   │   ├── backup/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── pdf/
│   │   ├── src/
│   │   │   ├── statements/
│   │   │   ├── summaries/
│   │   │   ├── templates/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── ui/
│   │   ├── src/
│   │   └── tests/
│   │
│   └── test-fixtures/
│       ├── src/
│       └── fixtures/
│
├── legacy/
│   ├── index.html
│   ├── README.md
│   └── behavior-map.md
│
├── docs/
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── DATA-MODEL.md
│   ├── CALCULATION-RULES.md
│   ├── ROUNDING.md
│   ├── MIGRATION.md
│   ├── PRIVACY.md
│   ├── DEPLOYMENT.md
│   ├── REVIEW-PROCESS.md
│   ├── API-CONTRACT.md
│   ├── DECISIONS/
│   └── TASKS/
│
├── scripts/
│   ├── setup-worktrees.ps1
│   ├── run-agents.ps1
│   ├── create-pull-requests.ps1
│   ├── verify-migration.ts
│   └── anonymize-fixture.ts
│
├── tests/
│   ├── characterization/
│   ├── integration/
│   ├── migration/
│   └── e2e/
│
├── private-data/
│   └── .gitkeep
│
└── .github/
    ├── workflows/
    │   ├── ci.yml
    │   ├── deploy-pages.yml
    │   └── agent-review.yml
    ├── pull_request_template.md
    ├── ISSUE_TEMPLATE/
    └── CODEOWNERS
```

---

## 5. Ziel-Datenmodell

Das Datenmodell muss fachliche Stammdaten, zeitbezogene Abrechnungsdaten und technische Metadaten trennen.

### 5.1 Zentrale Entitäten

```text
Organization / Mandant
OwnerCompany / Eigentümergesellschaft
Property / Liegenschaft
Building / Gebäude oder Abrechnungsblock
Unit / Nutzungseinheit
Person / Vertragspartner
Tenancy / Mietverhältnis
OccupancyPeriod / Nutzungszeitraum
BillingPeriod / Abrechnungsjahr
CostCategory / Kostenart
CostEntry / Kostenbuchung oder Rechnung
AllocationRule / Umlageregel
HeatingSystem / Heizsystem
HeatingCircuit / Heizkreis
EnergySource / Energiequelle
FuelStock / Brennstoffbestand
FuelDelivery / Lieferung
Meter / Zähler
MeterReading / Ablesung
Prepayment / Vorauszahlung
CalculationRun / Berechnungslauf
CalculationResult / Berechnungsergebnis
ValidationIssue / Prüfhinweis
Document / erzeugtes Dokument
AuditEvent / Änderungsprotokoll
```

### 5.2 Trennung von Stammdaten und Abrechnungsdaten

Stammdaten:

- Firma/Eigentümer
- Bankverbindung
- Objekt
- Gebäude
- Einheit
- Nutzeridentität
- Zähler
- dauerhafte Umlageschlüssel
- Heizungsanlage

Abrechnungsjahresbezogene Daten:

- Zeitraum
- Nutzerzeiträume
- Kosten
- Rechnungen
- Lieferungen
- Anfangs- und Restbestände
- Zählerstände
- Verbräuche
- Vorauszahlungen
- CO₂-Preis
- Freigabestatus
- Berechnungssnapshot
- PDF-Version

### 5.3 Technische Regeln

- IDs sind stabile Strings, bevorzugt UUIDs.
- Datumswerte werden als ISO-Datum `YYYY-MM-DD` gespeichert.
- Zeitstempel werden als ISO-8601 mit Zeitzone gespeichert.
- Geldbeträge werden als ganze Centwerte gespeichert.
- Mengen erhalten Einheit und Dezimalwert.
- Prozentwerte werden nicht als formatierte Strings gespeichert.
- Einheiten werden nicht aus Beschriftungen abgeleitet.
- Leere Werte sind nicht automatisch `0`.
- `null`, „nicht vorhanden“, „nicht erfasst“ und `0` müssen unterscheidbar bleiben.
- Jede gespeicherte Datei trägt eine explizite `schemaVersion`.
- Jede Migration ist vorwärtsgerichtet, getestet und protokolliert.
- Unbekannte neuere Schema-Versionen werden nicht überschrieben.

---

## 6. Fachliche Rechenarchitektur

### 6.1 Reine Funktionen

Die Berechnungsengine erhält validierte Eingabedaten und liefert ein neues Ergebnisobjekt zurück.

Beispiel:

```ts
type CalculationInput = {
  billingPeriod: BillingPeriod;
  property: PropertySnapshot;
  occupancies: OccupancyPeriod[];
  costs: CostEntry[];
  heating: HeatingInput;
  prepayments: Prepayment[];
};

type CalculationOutput = {
  totals: CalculationTotals;
  unitResults: UnitCalculationResult[];
  tenantResults: TenantCalculationResult[];
  heatingResults: HeatingResult[];
  co2Result: Co2Result;
  controlDifferences: ControlDifference[];
  warnings: ValidationIssue[];
};

export function calculateBilling(
  input: CalculationInput
): CalculationOutput;
```

Nicht zulässig:

- direkter Zugriff auf DOM,
- direkter Zugriff auf `localStorage`,
- Nutzung globaler App-Objekte,
- Mutation der Eingabedaten,
- UI-Formatierung innerhalb der Rechenlogik,
- implizite Rundungen.

### 6.2 Zu erhaltende Berechnungsbereiche

Mindestens:

- tagegenaue Nutzerzeiträume,
- Leerstand,
- Nutzerwechsel,
- Umlage nach Nutzfläche,
- Umlage nach beheizter Fläche,
- Umlage nach Verbrauchseinheiten,
- Umlage je Nutzungseinheit,
- direkte Zuordnung,
- Kostenaufteilung je Gebäude oder Heizkreis,
- Vorauszahlungen,
- Kontrollsummen,
- Kosten ohne Zuordnung,
- Heizungsbetriebskosten,
- Brennstoffanfangsbestand,
- Lieferungen,
- Restbestand,
- FIFO-Bewertung,
- Brennstoffverbrauchskosten,
- Grund- und Verbrauchskosten,
- 50-%- bis 70-%-Verbrauchsanteil,
- Warmwasseranteil,
- mehrere Energiequellen,
- Wärmepumpe plus Spitzenlast,
- CO₂-Menge,
- CO₂-Kosten,
- Vermieter-/Mieteranteil,
- Jahres- und Teiljahreshochrechnung, soweit im Bestand verwendet,
- Rundungsdifferenzen,
- Abrechnung je Nutzer,
- Gesamtabrechnung.

### 6.3 Rundung

In `docs/ROUNDING.md` ist für jeden Rechenschritt festzulegen:

- interne Genauigkeit,
- Zeitpunkt der Rundung,
- Rundungsverfahren,
- Verteilung von Restcentbeträgen,
- Kontrollsumme,
- zulässige Toleranz.

Mindestanforderung:

```text
Summe aller Nutzeranteile
+ Vermieteranteile
+ nicht zugeordnete Beträge
= Gesamtkosten
```

Eine verbleibende Differenz über 0,01 Euro muss als Fehler behandelt werden, sofern sie nicht fachlich begründet ist.

---

## 7. Validierung und Freigabe

Prüfungen werden nicht in UI-Komponenten verteilt, sondern in `packages/validators` gebündelt.

### 7.1 Kategorien

- `error`: Abrechnung darf nicht freigegeben werden.
- `warning`: Abrechnung darf nur mit bewusster Bestätigung freigegeben werden.
- `info`: Hinweis ohne Sperrwirkung.

### 7.2 Zu übernehmende Prüfungen

Mindestens:

- fehlende Firmen- oder Objektstammdaten,
- fehlende IBAN,
- ungültiger Abrechnungszeitraum,
- Nutzer außerhalb des Abrechnungszeitraums,
- fehlende Nutzerflächen,
- fehlende Vorauszahlungen,
- fehlende Kostenbereiche,
- unplausible Umlageschlüssel,
- fehlende Kostenarten,
- fehlende Heizkreiszuordnung,
- fehlende Belegverknüpfung,
- Kostensteigerungsprüfung,
- negative oder unplausible Beträge,
- fehlende Zählernummern,
- fehlende Jahresrechnungen,
- unplausible CO₂-Werte,
- Kontrolldifferenz,
- unverteilter Heizkostenanteil,
- direkte Kosten ohne Zuordnung,
- nicht unterstützte Schema-Version.

### 7.3 Freigabestatus

Empfohlene Statusfolge:

```text
DRAFT
IN_REVIEW
READY_FOR_PDF
FINALIZED
SUPERSEDED
```

Nach `FINALIZED` dürfen fachliche Eingaben nicht stillschweigend geändert werden. Änderungen erzeugen eine neue Version oder setzen den Status kontrolliert zurück.

---

## 8. Persistenz und Datenhaltung

### 8.1 Phase 1: lokal und offline-fähig

Phase 1 bleibt serverlos und datenschutzfreundlich:

- IndexedDB als primärer lokaler Speicher,
- JSON-Datei als exportierbare und portable Datensicherung,
- optionaler File-System-Access-Adapter für automatische Dateisicherung,
- Snapshots und Wiederherstellung,
- Konflikterkennung,
- Schema-Versionsschutz.

Die Anwendung darf auf GitHub Pages bereitgestellt werden. GitHub Pages hostet ausschließlich statische App-Dateien, keine produktiven Abrechnungsdaten.

### 8.2 Storage-Adapter

```ts
export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData, options?: SaveOptions): Promise<SaveResult>;
  createSnapshot(data: AppData): Promise<SnapshotMeta>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  restoreSnapshot(id: string): Promise<AppData>;
}
```

Implementierungen:

```text
MemoryStorageAdapter
IndexedDbStorageAdapter
JsonFileStorageAdapter
FileSystemAccessStorageAdapter
```

Spätere Implementierung:

```text
RemoteApiStorageAdapter
```

### 8.3 Phase 2: Mehrbenutzer- und Mandantenbetrieb

Erst nach abgeschlossener Migration:

- Anmeldung,
- Rollen und Rechte,
- echte Mandantentrennung,
- Datenbank,
- serverseitige Backups,
- revisionsfähige Protokollierung,
- Zugriffsschutz,
- Verschlüsselung,
- Auftragsverarbeitung und Datenschutzkonzept.

GitHub Pages allein ist hierfür nicht ausreichend. Ein Backend wird über eine abstrakte API angebunden und separat betrieben.

---

## 9. Import, Export und Datenmigration

### 9.1 Unveränderter Sicherungspunkt

Vor jeder Migration:

1. aktuelle `index.html` sichern,
2. aktuelle produktive JSON-Datei sichern,
3. Prüfsumme erstellen,
4. schreibgeschützte Kopie anlegen,
5. Import in die alte App testen,
6. mindestens eine vollständige PDF-Abrechnung als Vergleich speichern.

### 9.2 Legacy-Import

Die neue Anwendung muss die bestehende Schema-Version 3 importieren können.

Pipeline:

```text
Datei auswählen
→ JSON syntaktisch prüfen
→ Schema-Version erkennen
→ Legacy-Schema validieren
→ unveränderte Quelldatei hashen
→ Migration in aktuelles Schema
→ Migrationsbericht erstellen
→ fachliche Plausibilitätsprüfung
→ Vorschau
→ bewusste Übernahme
→ Snapshot erstellen
```

### 9.3 Migrationsbericht

Der Bericht enthält:

- Quelldateiname,
- Hash der Quelldatei,
- erkannte Schema-Version,
- Ziel-Schema-Version,
- Anzahl Firmen,
- Anzahl Objekte,
- Anzahl Abrechnungsjahre,
- Anzahl Nutzer,
- Anzahl Kostenpositionen,
- Anzahl Heizkreise,
- Anzahl Energiequellen,
- Anzahl Warnungen,
- geänderte Felder,
- verworfene oder nicht zuordenbare Felder,
- Datum und App-Version.

### 9.4 Round-Trip-Test

Folgender Test ist verpflichtend:

```text
Legacy-v3-Datei
→ Import
→ Migration
→ Export im neuen Schema
→ erneuter Import
→ fachlich identischer Datenbestand
```

### 9.5 Vergleich der Berechnungsergebnisse

Für anonymisierte Vergleichsfälle:

```text
alte App berechnet Ergebnis A
neue Engine berechnet Ergebnis B
```

Akzeptanz:

- Gesamtkosten identisch,
- Heizkosten identisch,
- CO₂-Anteile identisch,
- Vorauszahlungen identisch,
- Saldo je Nutzer maximal 0,01 Euro Abweichung,
- jede größere Abweichung dokumentiert und freigegeben.

---

## 10. PDF- und Dokumentausgabe

PDF-Erzeugung wird vom UI getrennt.

Eingabe:

```text
finalisiertes Berechnungsergebnis
+ Dokumentvorlage
+ Absenderdaten
+ Empfängerdaten
+ rechtliche Hinweise
```

Ausgabe:

- Einzelabrechnung je Nutzer,
- Gesamtabrechnung,
- Kostenübersicht,
- Heizkostenübersicht,
- CO₂-Ausweis,
- Freigabeprotokoll,
- optional ZIP-Paket.

PDF-Inhalte werden über Snapshot-Daten erzeugt. Ein später veränderter Live-Datenbestand darf ein bereits finalisiertes Dokument nicht rückwirkend verändern.

---

## 11. Benutzeroberfläche

Die neue UI übernimmt die vorhandene fachliche Navigation, wird jedoch in Komponenten und Features zerlegt.

Empfohlene Bereiche:

```text
Dashboard
Eigentümer/Verwalter
Liegenschaften
Gebäude
Einheiten
Abrechnungsjahre
Nutzer und Nutzerwechsel
Buchungen und Belege
Kostenarten
Heizkreise und Energiequellen
Zähler und Verbräuche
CO₂
Berechnung
Prüfung und Freigabe
PDF und Export
Einstellungen und Backups
```

Anforderungen:

- keine fachliche Logik direkt in Komponenten,
- klare Lade-, Fehler- und Speicherzustände,
- keine stillen Datenänderungen,
- Undo oder Snapshot vor kritischen Aktionen,
- Tastaturbedienbarkeit,
- verständliche Fehlermeldungen,
- mobile Grundnutzbarkeit,
- Tabellen mit sinnvollen Filter- und Prüfoptionen,
- sichtbarer Status des aktuellen Abrechnungsjahres,
- sichtbare Schema- und App-Version.

---

## 12. Repository-Regeln für Agenten

### 12.1 `AGENTS.md`

```md
# Gemeinsame Agentenregeln

Lies vor jeder Bearbeitung:

- docs/PROJECT.md
- docs/ARCHITECTURE.md
- docs/DATA-MODEL.md
- docs/CALCULATION-RULES.md
- docs/ROUNDING.md
- docs/MIGRATION.md
- die zugewiesene Datei unter docs/TASKS/

Verbindliche Regeln:

1. Arbeite nur im zugewiesenen Branch und Worktree.
2. Arbeite nur in den für die Aufgabe freigegebenen Pfaden.
3. Ändere keine fachlichen Verträge stillschweigend.
4. Ändere keine Schema-Version ohne Migration und Test.
5. Verwende keine echten personenbezogenen Daten.
6. Speichere Geldbeträge intern in Cent.
7. Schreibe oder aktualisiere Tests.
8. Führe Lint, Typecheck, Tests und Build aus.
9. Erstelle kleine, nachvollziehbare Commits.
10. Dokumentiere Annahmen, Abweichungen und offene Punkte.
11. Kein direkter Push auf main.
12. Kein Merge ohne erfolgreichen CI-Status.
13. Keine automatische Löschung oder Überschreibung von Legacy-Daten.
14. Keine fachliche Änderung nur zur Vereinfachung der Implementierung.
```

### 12.2 `CLAUDE.md`

`CLAUDE.md` enthält dieselben Regeln und ergänzt:

```md
Du bist für Architektur, fachliche Konsistenz, Migrationsstrategie und Integrationsprüfung verantwortlich.

Bevor du eine Schnittstelle änderst:

1. dokumentiere den Änderungsgrund,
2. aktualisiere den Vertrag,
3. aktualisiere die Tests,
4. kennzeichne die Änderung im Pull Request.
```

---

## 13. Rollenverteilung zwischen Claude und Codex

### 13.1 Claude

Primärverantwortung:

- Gesamtarchitektur,
- Bestandsanalyse,
- fachliche Zerlegung,
- Datenmodell,
- Legacy-Mapping,
- Schema-Migrationen,
- Berechnungsverträge,
- Rundungsregeln,
- rechtliche und formelle Prüfstruktur,
- Integrationsentscheidungen,
- Review der Codex-Implementierung.

Bevorzugte Pfade:

```text
docs/
packages/schema/
packages/core/src/contracts/
packages/validators/
tests/characterization/
legacy/behavior-map.md
```

### 13.2 Codex GPT-5.6

Primärverantwortung:

- Repository-Scaffold,
- TypeScript-Implementierung,
- UI-Komponenten,
- Storage-Adapter,
- Import-/Exporttechnik,
- PDF-Modul,
- Testautomatisierung,
- CI/CD,
- Refactoring,
- technische Fehlerbehebung,
- Review der Claude-Implementierung.

Bevorzugte Pfade:

```text
apps/web/
packages/persistence/
packages/import-export/
packages/pdf/
packages/ui/
.github/
scripts/
tests/integration/
tests/e2e/
```

### 13.3 Gemeinsame Dateien

Diese Dateien dürfen nicht gleichzeitig verändert werden:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
packages/schema/src/index.ts
packages/core/src/index.ts
docs/API-CONTRACT.md
```

Für gemeinsame Änderungen gilt:

1. eigener Integrations-Task,
2. nur ein zuständiger Agent,
3. kleiner Pull Request,
4. Review durch den anderen Agenten.

---

## 14. Branch- und Worktree-Modell

### 14.1 Branches

```text
main
agent/fable-<task>
agent/codex-<task>
integration/<milestone>
```

Beispiel:

```text
agent/claude-pr01-inventory
agent/codex-pr02-scaffold
agent/fable-pr03-schema
agent/codex-pr04-storage
```

### 14.2 Worktrees anlegen

PowerShell:

```powershell
$Repo = "C:\Projekte\nebenkosten-app"
$Claude = "C:\Projekte\nebenkosten-app-claude"
$Codex = "C:\Projekte\nebenkosten-app-codex"

git -C $Repo checkout main
git -C $Repo pull --ff-only

git -C $Repo worktree add $Claude -b agent/claude-current main
git -C $Repo worktree add $Codex -b agent/codex-current main
```

Bash:

```bash
git checkout main
git pull --ff-only

git worktree add ../nebenkosten-app-claude \
  -b agent/claude-current main

git worktree add ../nebenkosten-app-codex \
  -b agent/codex-current main
```

Vor einer neuen Arbeitsrunde werden alte Branches nicht ungeprüft wiederverwendet. Entweder werden sie sauber auf `main` rebased oder neue Task-Branches angelegt.

---

## 15. Automatischer Entwicklungsablauf

```text
1. Issue oder Task-Datei anlegen
2. Akzeptanzkriterien festlegen
3. Datei- und Pfadverantwortung festlegen
4. getrennte Branches und Worktrees anlegen
5. Claude und Codex parallel starten
6. beide Agenten führen Tests aus
7. beide Agenten committen
8. beide Agenten pushen
9. beide Agenten erstellen Pull Requests
10. Codex reviewt den Claude-PR
11. Claude reviewt den Codex-PR
12. Beanstandungen werden behoben
13. CI läuft erneut
14. höchstens zwei automatische Review-Schleifen
15. menschliche fachliche Abnahme
16. manueller Merge
17. Worktrees und Branches aufräumen
```

---

## 16. Push und Pull Request automatisieren

### 16.1 Push

Im jeweiligen Worktree:

```bash
git push -u origin agent/claude-current
```

```bash
git push -u origin agent/codex-current
```

Nach der ersten Verknüpfung genügt:

```bash
git push
```

### 16.2 Pull Request mit GitHub CLI

Claude-PR:

```bash
gh pr create \
  --base main \
  --head agent/claude-current \
  --title "Claude: <Aufgabe>" \
  --body-file docs/TASKS/<task>-pr-description.md
```

Codex-PR:

```bash
gh pr create \
  --base main \
  --head agent/codex-current \
  --title "Codex: <Aufgabe>" \
  --body-file docs/TASKS/<task>-pr-description.md
```

### 16.3 Pull-Request-Beschreibung

Jeder Pull Request enthält:

```md
## Ziel

## Umgesetzter Umfang

## Nicht umgesetzt

## Geänderte fachliche Regeln

## Schemaänderungen

## Migrationsauswirkungen

## Tests

## Testbefehle und Ergebnisse

## Datenschutzprüfung

## Risiken

## Screenshots oder Beispielausgabe

## Review-Schwerpunkte

## Rollback
```

---

## 17. Gegenseitiges Review

### 17.1 Codex prüft Claude

Prüfschwerpunkte:

- unvollständige oder widersprüchliche Verträge,
- TypeScript-Fehler,
- nicht deterministische Berechnung,
- fehlende Tests,
- Sicherheitsprobleme,
- fehlende Migrationen,
- fehlerhafte Rundungen,
- mutierte Eingabedaten,
- unklare Schnittstellen.

Review-Auftrag:

```text
Prüfe den Pull Request von Claude gegen main.

Kontrolliere insbesondere:

- fachliche und technische Widersprüche,
- Datenverlust bei Migrationen,
- fehlende Grenzfälle,
- Rundungsfehler,
- fehlende oder schwache Tests,
- unzulässige Kopplung an UI oder Persistenz,
- Datenschutzprobleme,
- nicht dokumentierte Schemaänderungen.

Nimm im ersten Review keine Änderungen vor.
Erstelle einen priorisierten Bericht mit:
BLOCKER, MAJOR, MINOR und NOTE.
Jeder Fund muss Datei, Zeile, Auswirkung und konkrete Korrektur nennen.
```

### 17.2 Claude prüft Codex

Prüfschwerpunkte:

- Erfüllung der fachlichen Akzeptanzkriterien,
- Übereinstimmung mit Datenmodell und Architektur,
- Funktionsverlust gegenüber der Legacy-App,
- falsche Annahmen,
- unzulässige Vereinfachungen,
- inkonsistente Status- oder Migrationslogik,
- fehlende Dokumentation.

Review-Auftrag:

```text
Prüfe den Pull Request von Codex gegen main.

Bewerte insbesondere:

- vollständige Umsetzung des Tasks,
- Einhaltung der Architektur,
- Einhaltung des Datenmodells,
- Übereinstimmung mit den Legacy-Funktionen,
- fachliche Korrektheit der Rechenwege,
- Migrationssicherheit,
- nachvollziehbare Fehlerbehandlung,
- ausreichende Tests.

Nimm im ersten Review keine Änderungen vor.
Erstelle einen priorisierten Bericht mit:
BLOCKER, MAJOR, MINOR und NOTE.
```

### 17.3 Review-Schleife

Automatisch zu beheben:

- BLOCKER
- MAJOR

MINOR werden dokumentiert und nur behoben, wenn sie den Task nicht unnötig ausweiten.

Maximal zwei automatische Schleifen:

```text
Implementierung
→ Review 1
→ Korrektur
→ Review 2
→ letzte Korrektur
→ menschliche Entscheidung
```

Die Agenten dürfen nicht endlos gegenseitig neue Anforderungen erzeugen.

---

## 18. Branch-Schutz auf GitHub

Für `main` aktivieren:

- Pull Request erforderlich,
- mindestens ein Review erforderlich,
- offene Review-Kommentare müssen erledigt sein,
- direkte Pushes gesperrt,
- Force-Push gesperrt,
- Branch-Löschung gesperrt,
- erforderliche Statusprüfungen,
- Branch muss aktuell zu `main` sein,
- optional lineare Historie.

Erforderliche Checks:

```text
lint
format-check
typecheck
unit-tests
integration-tests
migration-tests
build
e2e-smoke
privacy-scan
```

---

## 19. CI/CD

### 19.1 CI-Workflow

Beispiel `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Format
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test:unit

      - name: Integration tests
        run: pnpm test:integration

      - name: Migration tests
        run: pnpm test:migration

      - name: Build
        run: pnpm build
```

### 19.2 Deployment

Für Phase 1:

```text
main
→ CI erfolgreich
→ Produktions-Build
→ Deployment auf GitHub Pages
```

Das Deployment enthält:

- JavaScript,
- CSS,
- statische Assets,
- keine produktiven Daten,
- keine Geheimnisse,
- keine privaten Dokumente.

Preview-Deployments für Pull Requests sind zulässig, sofern nur anonymisierte Fixtures verwendet werden.

---

## 20. Migrationsphasen und Pull-Request-Plan

### PR 00 – Sicherung und Repository-Grundschutz

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- Git-Repository initialisieren,
- `legacy/index.html` unverändert ablegen,
- `.gitignore` erstellen,
- `private-data/` vorbereiten,
- Branch-Schutz dokumentieren,
- `AGENTS.md` und `CLAUDE.md` anlegen,
- Checksumme der Legacy-Datei dokumentieren,
- keine fachliche Änderung.

Akzeptanz:

- Legacy-App läuft unverändert,
- private Daten sind ausgeschlossen,
- erster CI-Skeleton läuft.

### PR 01 – Bestandsaufnahme und Refactor-Map

Verantwortlich: Claude  
Review: Codex

Aufgaben:

- Funktionen der Legacy-App inventarisieren,
- globale Objekte und Abhängigkeiten erfassen,
- Datenmodell v3 dokumentieren,
- Berechnungswege kartieren,
- Prüfungen kartieren,
- PDF-Ausgaben kartieren,
- Risiken und unbekannte Bereiche markieren,
- `legacy/behavior-map.md` erstellen.

Akzeptanz:

- jede wesentliche Legacy-Funktion ist einem künftigen Modul zugeordnet,
- keine Codeänderung an der Legacy-App.

### PR 02 – Workspace und TypeScript-Scaffold

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- pnpm Workspace,
- Vite/React/TypeScript,
- Paketstruktur,
- ESLint,
- Prettier,
- Vitest,
- Playwright-Grundgerüst,
- CI vollständig.

Akzeptanz:

- `pnpm install`,
- `pnpm lint`,
- `pnpm typecheck`,
- `pnpm test`,
- `pnpm build`
  laufen erfolgreich.

### PR 03 – Schema und Legacy-v3-Mapping

Verantwortlich: Claude  
Review: Codex

Aufgaben:

- neues Schema definieren,
- Legacy-v3-Schema erfassen,
- Feldmapping dokumentieren,
- Migrationsschnittstelle definieren,
- Fehler- und Warnungsmodell definieren,
- Testfälle formulieren.

Akzeptanz:

- keine unbekannten Legacy-Felder werden still verworfen,
- jede Transformation ist dokumentiert.

### PR 04 – Legacy-v3-Importer

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- Parser,
- Laufzeitvalidierung,
- Migration,
- Migrationsbericht,
- Tests,
- Round-Trip-Grundtest.

Akzeptanz:

- anonymisierte v3-Datei wird vollständig importiert,
- ungültige Dateien werden verständlich zurückgewiesen,
- neuere unbekannte Versionen werden nicht überschrieben.

### PR 05 – Characterization Tests

Verantwortlich: Claude  
Review: Codex

Aufgaben:

- repräsentative anonymisierte Abrechnungsfälle,
- erwartete Ergebnisse aus Legacy-App,
- Grenzfälle,
- dokumentierte Rundungen,
- Testmatrix.

Mindestfälle:

- vollständiges Jahr,
- Nutzerwechsel,
- Leerstand,
- mehrere Häuser,
- mehrere Heizkreise,
- Heizöl mit Anfangs- und Restbestand,
- Pellets,
- Wärmepumpe,
- Hybridheizung,
- zentrale Warmwasserbereitung,
- dezentrale Warmwasserbereitung,
- CO₂-Aufteilung,
- Direktkosten,
- fehlende Zuordnung,
- negative oder unplausible Werte.

### PR 06 – Core-Berechnungsengine

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- reine Rechenfunktionen,
- Umlage,
- Zeitanteile,
- Vorauszahlungen,
- Kontrollsummen,
- Rundung,
- Tests gegen Characterization Fixtures.

Akzeptanz:

- keine DOM- oder Storage-Abhängigkeit,
- Ergebnisse entsprechen Legacy-Vergleich.

### PR 07 – Heizkosten- und CO₂-Modul

Verantwortlich: Claude für Vertrag und Testfälle  
Codex für Implementierung  
Gegenseitiges Review

Aufgaben:

- Energiequellen,
- Lieferungen,
- Anfangsbestand,
- Restbestand,
- FIFO,
- Betriebsstrom,
- Grund-/Verbrauchskosten,
- Warmwasser,
- CO₂,
- Vermieter-/Mieteranteil.

Akzeptanz:

- alle Vergleichsfälle bestehen,
- Rechenweg ist im Ergebnis nachvollziehbar.

### PR 08 – Persistenz und Backup

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- IndexedDB,
- Memory Adapter,
- JSON-Datei,
- File-System-Access,
- Snapshots,
- Konflikterkennung,
- Wiederherstellung,
- Versionsschutz.

Akzeptanz:

- Speichern und Laden ohne Datenverlust,
- Wiederherstellung getestet,
- neuere Schema-Version wird blockiert.

### PR 09 – UI-Grundstruktur

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- Routing,
- Firmen,
- Objekte,
- Abrechnungsjahre,
- Nutzer,
- Kosten,
- Heizkreise,
- Berechnung,
- Freigabe.

Akzeptanz:

- keine Rechenlogik in Komponenten,
- Legacy-Hauptablauf ist in der neuen UI durchführbar.

### PR 10 – Validatoren und Freigabe

Verantwortlich: Claude  
Review: Codex

Aufgaben:

- formelle Prüfungen,
- Plausibilitätsprüfungen,
- Fehlerklassen,
- Freigabestatus,
- Sperrlogik,
- Bestätigungslogik.

### PR 11 – PDF und Export

Verantwortlich: Codex  
Review: Claude

Aufgaben:

- Einzelabrechnung,
- Gesamtabrechnung,
- Heizkostenübersicht,
- CO₂-Ausweis,
- ZIP-Export,
- snapshotbasierte Dokumente.

### PR 12 – Produktionsmigration und Abnahme

Verantwortlich: beide  
Finale Freigabe: Mensch

Aufgaben:

- produktive Datei nur lokal sichern,
- Import in neue App,
- Migrationsbericht prüfen,
- Vergleichsabrechnung,
- PDF-Vergleich,
- Backup,
- Freigabeprotokoll,
- Rollback-Test.

---

## 21. Sofort verwendbarer Masterauftrag für Claude

```text
Du arbeitest als leitender Softwarearchitekt und fachlicher Integrator für den
kontrollierten Umbau der bestehenden Nebenkostenabrechnungs-App.

Lies vollständig:

- diese Markdown-Datei,
- AGENTS.md,
- CLAUDE.md,
- legacy/index.html,
- die aktuelle Task-Datei unter docs/TASKS/.

Verbindliche Ziele:

1. Bewahre alle funktionierenden Legacy-Funktionen.
2. Trenne Stammdaten, Abrechnungsdaten und technische Metadaten.
3. Dokumentiere das Datenmodell und alle Rechenverträge.
4. Verhindere Datenverlust bei der Schema-v3-Migration.
5. Definiere Characterization Tests vor größeren Refactorings.
6. Halte Geldbeträge intern in Cent.
7. Verändere keine fachliche Regel stillschweigend.
8. Verwende keine echten personenbezogenen Daten.
9. Arbeite ausschließlich in deinem Branch und Worktree.
10. Erstelle kleine Commits.
11. Führe alle relevanten Tests aus.
12. Pushe den Branch und erstelle einen Pull Request.
13. Reviewe anschließend den zugeordneten Codex-Pull-Request.
14. Melde BLOCKER und MAJOR präzise mit Datei, Zeile, Auswirkung und Lösung.
15. Führe keinen Merge in main aus.

Bevor du programmierst:

- analysiere den aktuellen Task,
- nenne erlaubte und gesperrte Pfade,
- nenne Annahmen,
- nenne Akzeptanzkriterien,
- nenne Testfälle.

Am Ende liefere:

- Zusammenfassung,
- geänderte Dateien,
- fachliche Entscheidungen,
- Testbefehle und Ergebnisse,
- Migrationsauswirkungen,
- Risiken,
- offene Punkte,
- Pull-Request-Link oder eindeutige PR-Daten.
```

---

## 22. Sofort verwendbarer Masterauftrag für Codex

```text
Du arbeitest als ausführender Senior-Softwareentwickler und technischer Reviewer
für den kontrollierten Umbau der bestehenden Nebenkostenabrechnungs-App.

Lies vollständig:

- diese Markdown-Datei,
- AGENTS.md,
- docs/ARCHITECTURE.md,
- docs/DATA-MODEL.md,
- docs/CALCULATION-RULES.md,
- docs/ROUNDING.md,
- docs/MIGRATION.md,
- die aktuelle Task-Datei unter docs/TASKS/.

Verbindliche Ziele:

1. Implementiere nur den zugewiesenen Umfang.
2. Bewahre das Verhalten der Legacy-App.
3. Lege fachliche Logik in reinen TypeScript-Modulen ab.
4. Kopple Berechnung nicht an React, DOM oder Persistenz.
5. Verwende intern Cent für Geldbeträge.
6. Schreibe Tests vor oder zusammen mit der Implementierung.
7. Verwende keine echten personenbezogenen Daten.
8. Arbeite ausschließlich in deinem Branch und Worktree.
9. Ändere keine gemeinsamen Verträge ohne dokumentierten Task.
10. Führe Format, Lint, Typecheck, Tests und Build aus.
11. Erstelle kleine Commits.
12. Pushe den Branch und erstelle einen Pull Request.
13. Reviewe anschließend den zugeordneten Claude-Pull-Request.
14. Melde BLOCKER und MAJOR präzise mit Datei, Zeile, Auswirkung und Lösung.
15. Führe keinen Merge in main aus.

Am Ende liefere:

- Zusammenfassung,
- geänderte Dateien,
- Testbefehle und Ergebnisse,
- Abweichungen vom Task,
- technische Schulden,
- Sicherheits- und Datenschutzprüfung,
- Pull-Request-Link oder eindeutige PR-Daten.
```

---

## 23. PowerShell-Ablauf für eine parallele Runde

Die konkreten Modellbezeichnungen werden als Variablen gesetzt, weil sie von der installierten CLI-Version und dem verfügbaren Konto abhängen können.

```powershell
$Repo = "C:\Projekte\nebenkosten-app"
$ClaudeDir = "C:\Projekte\nebenkosten-app-claude"
$CodexDir = "C:\Projekte\nebenkosten-app-codex"

$ClaudeBranch = "agent/claude-pr01-inventory"
$CodexBranch = "agent/codex-pr02-scaffold"

$ClaudeModel = "<INSTALLIERTE_CLAUDE_MODELL-ID>"
$CodexModel = "<INSTALLIERTE_CODEX_MODELL-ID>"

git -C $Repo checkout main
git -C $Repo pull --ff-only

git -C $Repo worktree add $ClaudeDir -b $ClaudeBranch main
git -C $Repo worktree add $CodexDir -b $CodexBranch main

$ClaudeJob = Start-Job -ScriptBlock {
    param($Directory, $Model)

    Set-Location $Directory

    claude --model $Model -p @"
Lies MASTERPLAN_MIGRATION_FABLE_CODEX.md und
docs/TASKS/PR-01-BESTANDSAUFNAHME.md vollständig.
Bearbeite nur diesen Task.
Führe Tests aus, committe, pushe und erstelle einen Pull Request.
Führe keinen Merge aus.
"@
} -ArgumentList $ClaudeDir, $ClaudeModel

$CodexJob = Start-Job -ScriptBlock {
    param($Directory, $Model)

    Set-Location $Directory

    codex exec `
        --model $Model `
        --sandbox workspace-write `
        @"
Lies MASTERPLAN_MIGRATION_FABLE_CODEX.md und
docs/TASKS/PR-02-SCAFFOLD.md vollständig.
Bearbeite nur diesen Task.
Führe Tests aus, committe, pushe und erstelle einen Pull Request.
Führe keinen Merge aus.
"@
} -ArgumentList $CodexDir, $CodexModel

Wait-Job $ClaudeJob, $CodexJob

Receive-Job $ClaudeJob
Receive-Job $CodexJob
```

Hinweis: Vor der ersten Automatisierung müssen Git, GitHub CLI, Claude CLI und Codex CLI angemeldet und funktionsfähig sein.

---

## 24. Abschlusskriterien des Gesamtumzugs

Der Umzug ist erst abgeschlossen, wenn alle folgenden Punkte erfüllt sind:

### Daten

- Legacy-Schema v3 kann importiert werden.
- Unbekannte Felder werden nicht still verworfen.
- Neuer Export kann erneut importiert werden.
- Snapshots und Backups funktionieren.
- Wiederherstellung wurde praktisch getestet.
- Produktive Daten befinden sich nicht in GitHub.

### Fachlichkeit

- Gesamtkosten stimmen mit der alten App überein.
- Nutzeranteile stimmen innerhalb der festgelegten Rundung überein.
- Heizkosten stimmen überein.
- CO₂-Aufteilung stimmt überein.
- Vorauszahlungen und Salden stimmen überein.
- Nutzerwechsel und Leerstände sind getestet.
- Kontrollsummen sind null beziehungsweise innerhalb der freigegebenen Toleranz.
- Alle Freigabeprüfungen sind übernommen oder ausdrücklich ersetzt.

### Technik

- TypeScript ohne Fehler.
- Lint erfolgreich.
- Unit-Tests erfolgreich.
- Integrationstests erfolgreich.
- Migrationstests erfolgreich.
- Build erfolgreich.
- End-to-End-Smoke-Test erfolgreich.
- GitHub-Pages-Deployment reproduzierbar.
- Keine geheimen oder personenbezogenen Daten im Repository.
- Branch-Schutz ist aktiv.

### Bedienung

- Eigentümer kann angelegt werden.
- Objekt kann angelegt werden.
- Abrechnungsjahr kann angelegt werden.
- Nutzer und Nutzerwechsel können gepflegt werden.
- Kosten und Rechnungen können erfasst werden.
- Heizkreise und Energiequellen können gepflegt werden.
- Berechnung kann durchgeführt werden.
- Fehler und Warnungen sind verständlich.
- Abrechnung kann freigegeben werden.
- PDF kann erstellt werden.
- Daten können exportiert, importiert und wiederhergestellt werden.

### Abnahme

- Claude-Review ohne offene BLOCKER.
- Codex-Review ohne offene BLOCKER.
- CI vollständig grün.
- Vergleichsabrechnung dokumentiert.
- Rollback getestet.
- menschliche Freigabe erteilt.
- Merge in `main` durchgeführt.
- Release-Tag erstellt.

---

## 25. Nicht zulässige Abkürzungen

Nicht zulässig:

- die alte App sofort löschen,
- alles in einem einzigen großen Pull Request umbauen,
- beide Agenten im selben Ordner arbeiten lassen,
- direkt auf `main` pushen,
- echte Daten als Testdaten verwenden,
- Migrationsfehler mit Standardwert `0` verdecken,
- unbekannte Felder beim Import ignorieren,
- Geldbeträge ausschließlich als JavaScript-Fließkommazahlen behandeln,
- Berechnungslogik in React-Komponenten schreiben,
- Berechnungsergebnisse nur optisch vergleichen,
- Tests nachträglich weglassen,
- Agenten unbegrenzt gegenseitig reviewen lassen,
- automatisch mergen, solange die Migration nicht stabil abgenommen ist,
- GitHub als Datenbank für Mieter- oder Abrechnungsdaten verwenden.

---

## 26. Erste konkrete Ausführung

Die erste Arbeitsrunde besteht ausschließlich aus:

```text
Claude:
PR 01 – Bestandsaufnahme und Refactor-Map

Codex:
PR 00 – Sicherung und Repository-Grundschutz
oder anschließend
PR 02 – Workspace und TypeScript-Scaffold
```

Claude beginnt nicht mit der vollständigen Neustrukturierung der Rechenlogik, bevor die Bestandsaufnahme abgeschlossen ist.

Codex beginnt nicht mit dem Nachbauen der Fachlogik, bevor Datenmodell, Migrationsmapping und Characterization Tests ausreichend definiert sind.

Die erste fachlich produktive Migration beginnt frühestens mit PR 04 bis PR 06.

---

## 27. Entscheidungsregel bei Konflikten

Prioritäten:

```text
1. Schutz produktiver Daten
2. fachliche Richtigkeit
3. Reproduzierbarkeit
4. Migrationsfähigkeit
5. Testbarkeit
6. Wartbarkeit
7. Bedienkomfort
8. Entwicklungsgeschwindigkeit
```

Bei widersprüchlichen Vorschlägen von Claude und Codex wird nicht automatisch eine Variante gewählt. Beide Varianten werden mit Auswirkungen dokumentiert. Die Entscheidung erfolgt im Pull Request oder in einem Architecture Decision Record unter:

```text
docs/DECISIONS/ADR-XXXX-<thema>.md
```

---

## 28. Ergebnis des Verfahrens

Nach Umsetzung dieses Masterplans entsteht keine bloß optisch modernisierte Version der bisherigen `index.html`, sondern eine kontrolliert migrierte Anwendung mit:

- nachvollziehbarer Fachlogik,
- versioniertem Datenmodell,
- sicherer Datenübernahme,
- automatisierten Tests,
- reproduzierbarem Build,
- geschütztem GitHub-Workflow,
- paralleler Agentenentwicklung,
- gegenseitigem Review,
- klarer menschlicher Endfreigabe.
