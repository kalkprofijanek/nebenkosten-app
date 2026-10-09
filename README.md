# Nebenkosten-App

Betriebs- und Heizkostenabrechnung für Wohnraum – kostenlos, quelloffen und
**lokal**. Umlage nach BetrKV, Heizkosten nach HeizKV (Brennstoffkonto,
Wärmemengenzähler, Schätzung nach § 9a, Nutzerwechsel nach § 9b),
CO₂-Kostenaufteilung nach CO2KostAufG, Vorauszahlungsanpassung nach § 560 BGB
und fertige PDF-Abrechnungen für jede Mietpartei.

**Empfohlen: [mit einem KI-Agenten arbeiten](#empfohlen-mit-ki-agent)**
· [▶ App im Browser öffnen](https://kalkprofijanek.github.io/nebenkosten-app/)
· [KI-Anleitung](docs/KI-ANLEITUNG.md)
· [Benutzerhandbuch](docs/BENUTZERHANDBUCH.md)
· [Mitwirken](CONTRIBUTING.md)

> **Haftungsausschluss.** Die App ist ein Rechenwerkzeug und ersetzt keine
> Rechts- oder Steuerberatung. Für die Richtigkeit einer Abrechnung ist allein
> der Abrechnende verantwortlich. Bereitstellung ohne Gewährleistung gemäß
> [AGPL-3.0](LICENSE).

**Aktuelle Version: 1.3.0 · Schema v5**

## Empfohlen: mit KI-Agent

Die meiste Arbeit einer Nebenkostenabrechnung ist nicht das Rechnen, sondern
das **Zusammentragen und Prüfen**: Rechnungen lesen, Leistungszeiträume
abgrenzen, Bankbuchungen zuordnen, Zählerstände plausibilisieren,
Eigentümer- und Mieterwechsel sauber abbilden. Genau dafür eignet sich ein
KI-Coding-Agent wie **Claude Code** (Terminal, Desktop-App oder IDE):

1. Repository klonen, `pnpm install`, die eigene Datendatei nach
   `private-data/` legen (wird nie committet).
2. Den Agenten mit den Belegen arbeiten lassen: Rechnungen (PDF/Scan),
   Kontoauszüge, Ablesebögen, Fotos von Zählerständen. Er liest aus, ordnet
   zu, grenzt ab und schlägt Korrekturen vor – **mit Quelle für jeden Wert**.
3. Korrekturen schreibt der Agent als kleine, nachvollziehbare Skripte auf die
   Daten, **nach einer Sicherungskopie**. Unplausibles (z. B. Zählerstände,
   die kleiner werden) legt er Ihnen zur Entscheidung vor.
4. Rechnen, prüfen und PDFs erzeugen ohne Browser – mit exakt derselben
   Fachlogik wie die App:

   ```bash
   pnpm abrechnung private-data/nk-daten.json --jahr 2025 --out private-data/pdf-2025
   ```

   Ausgabe: Summen und Kontrolldifferenz, Verteilung je Heizkreis (inkl.
   25-%-Grenze nach § 9a Abs. 2 HeizKV), Nachzahlungen und Guthaben, alle
   Prüfhinweise sowie die PDFs (Einzelabrechnungen, Gesamtabrechnung intern
   und für Mieter). Mit `--json <datei>` zusätzlich maschinenlesbar.

5. **Sie entscheiden und geben frei.** Zum Abschluss die Datei in der App
   importieren, Prüfhinweise bestätigen, freigeben, versenden.

Rechnen, Verteilen, Runden und Rechtstexte bleiben immer in der getesteten
Fachlogik (`packages/core`, `packages/pdf`) – die KI liefert Daten und
Begründungen, keine eigenen Rechenwege. Ablauf, Regeln und Datenschutz:
[`docs/KI-ANLEITUNG.md`](docs/KI-ANLEITUNG.md).

## Alternative: nur im Browser

Ohne KI funktioniert alles auch direkt im Browser – praktisch für kleine
Objekte oder als Kontrollansicht:
**[App öffnen](https://kalkprofijanek.github.io/nebenkosten-app/)**.

- Ausschließlich für **Desktop-Browser** gedacht (siehe
  [ADR-0002](docs/DECISIONS/ADR-0002-DESKTOP-ONLY.md)).
- Alle Daten bleiben **lokal im Browser** (IndexedDB); kein Server, keine
  Anmeldung, keine Datenübertragung (Content Security Policy
  `connect-src 'none'`).
- **Regelmäßig unter „Sicherung“ eine JSON-Sicherung herunterladen.** Werden
  die Browserdaten gelöscht, sind die Abrechnungsdaten ohne Sicherung verloren.
- **Jahresabrechnung** führt in acht Schritten von Objekt und Belegung über
  Heizung, Zähler, Energie und Kosten bis zu Berechnung, Freigabe, PDF und
  Sicherung. Prüfhinweise verlinken direkt auf die Korrekturstelle.
- Bankbuchungen als CSV ([Formate](docs/BANK-CSV-FORMAT.md),
  [Beispiel](docs/beispiel/bankbuchungen-beispiel.csv)); Daten der Alt-App
  über **Daten importieren** (`nk-daten.json`, Legacy v3) mit Importvorschau.

## Was die App kann

**Abrechnung**

- Betriebskosten nach BetrKV nach Wohn- bzw. Heizfläche, Wohnungen, Verbrauch
  oder Direktzuordnung; nicht umlagefähige Anteile, Lohnanteile und – sofern
  erfasst – Bescheinigung nach § 35a EStG. Bankbuchungen per CSV-Import.
- Heizkosten nach HeizKV: Brennstoffkonto mit FIFO-Bewertung (Öl, Pellets,
  Flüssiggas), Wärmepumpen- und Leitungsenergie, Verteilung 70/30 bzw. 50/50,
  Warmwasser (auch nach Personen), Betriebsstrom.
- **Wärmemengenzähler** mit Zählerständen alt/neu je Mietpartei;
  **Schätzung nach § 9a HeizKV** mit Begründung und automatischer
  **Flächenverteilung über 25 %** (§ 9a Abs. 2); **Nutzerwechsel und
  Leerstand** (§ 9b HeizKV): Grundkosten nach Tagen, Verbrauch je Zeitraum
  (z. B. im KI-Ablauf nach Gradtagszahlen VDI 2067 aufgeteilt); Verbrauch im
  Leerstand trägt der Vermieter.
- CO₂-Kosten nach CO2KostAufG (Stufenmodell, Mieter-/Vermieteranteil).
- Eigentümerwechsel: Anfangsbestände, übernommene Kosten und Verbräuche des
  Voreigentümers lassen sich erfassen; Abgrenzung nach Leistungszeitraum und
  Auswertung einer **Erwerberabrechnung** erledigt der KI-Ablauf.

**Prüfungen** (vor jeder Freigabe)

- Kontrolldifferenz auf den Cent, mögliche Doppelbelege, negative Beträge,
  fehlende Mengen bei Energierechnungen, starker Kostenanstieg gegenüber dem
  Vorjahr, Vorauszahlungen (doppelt, fehlend, negativ).
- Zählerstände: Stand neu − Stand alt gegen erfassten Verbrauch (begründete
  Schätzungen ausgenommen), fehlende Jahresrechnungen und Jahresstände.
- Rechtsregeln mit Geltungszeitraum (z. B. Kabel-TV seit 01.07.2024,
  Fernablesbarkeit ab 2027), Rückstände aus dem Mietkonto.

**Einzelabrechnung (PDF)**

- Vollständige Rechnung je Kostenart, Brennstoffkonto, Heizkreis und
  „Ihre Verbrauchserfassung“ mit Zählerständen, Herleitung bzw. Schätzgrund.
- **Vorjahresvergleich als Grafik** (§ 6a HeizKV) – auch nach einem
  Eigentümerwechsel mit Vorjahreswerten aus der Abrechnung des Voreigentümers
  (mit Quellenangabe); Mittelwert des Heizkreises, Energieträger,
  Verbraucherinformationen.
- CO₂-Aufteilung nach § 7 Abs. 3 CO2KostAufG, Guthaben- und Nachzahlungstext
  (auch nach Auszug), Anpassung der Vorauszahlung nach § 560 BGB mit
  Rücksendeabschnitt, Anschriftfeld für Fensterkuverts.
- Gesamtabrechnung in zwei Fassungen: intern und zur Einsicht für Mieter.

## Was noch fehlt

Die vollständige, priorisierte Bauliste bis zur gesetzeskonformen Abrechnung
steht in **[docs/TODO.md](docs/TODO.md)** (inkl. § 6a HeizKV:
[docs/TODO-HEIZKV-6A.md](docs/TODO-HEIZKV-6A.md)). Kurzüberblick:

- **Fernablesung / Messdienst-Import**: Ablesedaten funkauslesbarer Zähler
  direkt übernehmen; Fernablesbarkeit ist ab 2027 Pflicht, dazu die
  monatliche Verbrauchsinformation nach § 6a HeizKV.
- **Zählertausch im Datenmodell**: mehrere Zähler je Nutzung mit Aus- und
  Einbaustand statt Schätzung.
- **Vorjahreswerte in der Oberfläche** pflegen (bisher über den Import bzw.
  den KI-Ablauf; Zählerstände sind unter „Verbrauch“ bereits pflegbar).
- **Gradtag-Aufteilung bei Nutzerwechsel** in der App selbst berechnen.
- **Witterungsbereinigung** des Vorjahresvergleichs (Gradtagszahlen des
  Standorts) und Vergleich mit einem normierten Durchschnittsnutzer.
- Einheit **kWh** statt „Einheiten“ für Wärmemengenzähler durchgängig.
- **Erfassungsliste der KI direkt importieren** (CSV → Kostenpositionen).
- **Versand mit Nachweis** (Serien-E-Mail, Zustelldatum je Mietpartei) und
  Mehrbenutzer-/Mandantenbetrieb.

Änderungen je Version: [`CHANGELOG.md`](CHANGELOG.md).

## Mitmachen

- **Fehler, Fachfragen, Wünsche:**
  [Issue eröffnen](https://github.com/kalkprofijanek/nebenkosten-app/issues/new/choose)
  – bitte **niemals echte Mieter-, Bank- oder Belegdaten** anhängen.
- **Code:** über Fork und Pull Request, siehe
  [`CONTRIBUTING.md`](CONTRIBUTING.md). KI-Coding-Agenten sind willkommen und
  lesen [`AGENTS.md`](AGENTS.md) automatisch.
- **Sicherheitslücken:** nicht öffentlich, sondern über
  [`SECURITY.md`](SECURITY.md).

## Grundsätze

- **Migration vor Erweiterung.** Bestehendes, funktionierendes Verhalten darf
  nicht stillschweigend verloren gehen; neue Produktfunktionen kommen erst nach
  der Migration.
- **Deterministische Fachlogik.** Berechnungen sind unabhängig von DOM, React
  oder Persistenz. Geldbeträge werden intern ausschließlich in **ganzen Cent**
  gehalten, niemals als Fließkomma-Euro.
- **Kein stiller Datenverlust.** Beim Import bleibt jedes unbekannte Legacy-Feld
  erhalten (`legacyUnmapped`) und wird im Migrationsbericht ausgewiesen.
- **Änderungen nur über geprüfte Pull Requests.** Kein direkter Push auf `main`,
  gegenseitiges Review, menschliche Endabnahme.

## Datenschutz & Sicherheit

Produktive Abrechnungs-, Mieter-, Bank-, Verbrauchs- und Belegdaten gehören
**ausschließlich** in das lokal ignorierte Verzeichnis `private-data/` und
niemals nach GitHub. Details: [`docs/PRIVACY.md`](docs/PRIVACY.md),
[`SECURITY.md`](SECURITY.md).

Alle Testdaten und Fixtures sind frei erfunden (Mustermann/Musterstraße-Stil).
Zwei Guards laufen lokal und in der CI und blockieren versehentliche Lecks:

```bash
node scripts/verify-repository-guardrails.mjs   # Pflichtdateien, .gitignore, verbotene Dateien
node scripts/scan-repository-content.mjs        # E-Mail/IBAN/Token/Adress-Heuristik
```

## Projektstruktur

```text
apps/
  web/                 React/Vite-UI (nur Darstellung, keine Fachlogik)
packages/
  schema/              Ziel-Datenmodell (Schema v5, Zod), Migrationen v3→v5 und v4→v5
  import-export/       Legacy-v3-Importer (Byte-Eingang, Hashing, Migration)
  core/                Reine Berechnungsengine (Umlage, Heizkosten, CO₂, Messverbrauch)
  persistence/         Storage-Adapter (Memory, IndexedDB, Datei), Snapshots, Backup
  validators/          Formelle & fachliche Prüfungen, Freigabelogik
  pdf/                 Dokument-/PDF-Erzeugung aus Snapshots
tests/                 characterization, integration, migration, e2e, privacy, repository
docs/                  Benutzer-, Architektur-, Daten- und Rundungsdokumentation
```

## Entwicklung

Voraussetzungen: **Node.js 22.23.1** (siehe `.node-version`) und **pnpm 11**
(via `corepack enable` oder `npm i -g pnpm@11`).

```bash
pnpm install

pnpm lint          # ESLint
pnpm typecheck     # TypeScript (Workspace)
pnpm test          # Architektur-, Repository-, Privacy-, Unit-, Integrations-,
                   # Migrations- und Characterization-Tests
pnpm build         # Alle Pakete bauen
pnpm privacy:scan  # Repository- und Inhalts-Guard
```

Weitere Skripte: `pnpm test:coverage`, `pnpm test:e2e`, `pnpm format`. Der
vollständige CI-Lauf entspricht `pnpm run ci`. In der GitHub-CI laufen dieselben
Schritte als separate Checks (`lint`, `typecheck`, diverse `*-tests`,
`coverage`, `build`, `e2e-smoke`, `privacy-scan`, `security-audit`,
`repository-guardrails`).

## Entwicklungsstand

Die App ist vollständig aus der früheren Einzeldatei-Version migriert und wird
seitdem in kleinen, geprüften Pull Requests weiterentwickelt. Welche Funktionen
in welcher Version hinzugekommen sind, steht in [`CHANGELOG.md`](CHANGELOG.md).

Verbindliche Rechenvorgabe: Kontrolldifferenz-Toleranz **0,01 €** im Zielsystem
(der Legacy-Wert 0,50 € bleibt nur dokumentierter Warnwert, siehe
[`docs/ROUNDING.md`](docs/ROUNDING.md)).

## Dokumentation

- [`docs/BENUTZERHANDBUCH.md`](docs/BENUTZERHANDBUCH.md) – Bedienung für Anwender
- [`docs/KI-ANLEITUNG.md`](docs/KI-ANLEITUNG.md) – Arbeiten mit Claude/ChatGPT
- [`docs/BANK-CSV-FORMAT.md`](docs/BANK-CSV-FORMAT.md) – CSV-Import von Bankbuchungen
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) – Ziel-Datenmodell
- [`docs/MIGRATION.md`](docs/MIGRATION.md) – v3→v4-Feldmapping und Pipeline
- [`docs/ROUNDING.md`](docs/ROUNDING.md) – Rundungsregeln je Rechenschritt
- [`docs/HEATING-CO2.md`](docs/HEATING-CO2.md) – Heizkosten- und CO₂-Logik
- [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md) – Speicher- und Backup-Konzept
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) – Build, Pages und Rollback
- [`docs/DECISIONS/`](docs/DECISIONS) – Architecture Decision Records (u. a. ADR-0002 nur Desktop, ADR-0003 Mietkonto)

## Status

Die App ist auf GitHub Pages veröffentlicht und wird mit jedem Merge auf
`main` aktualisiert. Das Repository ist öffentlich und enthält ausschließlich
fiktive Testdaten. Offene Punkte: siehe [Was noch fehlt](#was-noch-fehlt).

## Lizenz

Copyright © 2026 kalkprofijanek und Mitwirkende.

Lizenziert unter der [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`). Wer die App verändert und anderen – auch über ein
Netzwerk – bereitstellt, muss den geänderten Quellcode unter derselben Lizenz
zugänglich machen.
