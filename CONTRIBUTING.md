# Mitwirken

Danke, dass Sie zur Nebenkosten-App beitragen möchten. Beiträge sind
willkommen – als Fehlermeldung, Fachfrage, Verbesserungsvorschlag oder Code.

## Ohne Programmierkenntnisse

- **Fehler melden** oder **Funktion wünschen**: über die
  [Issue-Vorlagen](https://github.com/kalkprofijanek/nebenkosten-app/issues/new/choose).
- **Fachfragen** (Umlage, HeizKV, CO₂-Aufteilung, Rundung): Vorlage
  „Fachfrage“. Fachliche Hinweise mit Normbezug sind besonders wertvoll.
- **Bankformate**: Wenn der CSV-Import Ihrer Bank nicht funktioniert, melden
  Sie die Kopfzeile des Exports (nur die Spaltennamen, keine Buchungen).

## Die wichtigste Regel: keine echten Daten

Dieses Repository ist öffentlich. **Niemals** in Issues, Pull Requests,
Commits, Tests, Screenshots oder Logs:

- Namen, Anschriften, E-Mail-Adressen realer Personen,
- IBANs, Kontoauszüge, Zahlungsdaten,
- Rechnungen, Belege, Zählernummern, echte Verbräuche,
- JSON-Sicherungen oder `nk-daten.json`.

Verwenden Sie erfundene Werte („Beispiel Stadtwerke“, „Mieter Wohnung 1“).
Ein automatischer Scan blockiert typische Lecks, ersetzt aber nicht Ihre
Sorgfalt. Ist doch etwas veröffentlicht worden: sofort melden (siehe
[`SECURITY.md`](SECURITY.md)).

## Code beitragen

Beiträge erfolgen ausschließlich über **Fork und Pull Request**. Direkte
Schreibrechte werden nicht vergeben; `main` ist geschützt, jeder Pull Request
braucht grüne Prüfungen und die Freigabe des Maintainers.

### Einrichtung

Voraussetzungen: **Node.js 22.23.1** (siehe `.node-version`) und **pnpm 11**
(`corepack enable` oder `npm i -g pnpm@11`).

```bash
git clone https://github.com/<ihr-konto>/nebenkosten-app.git
cd nebenkosten-app
pnpm install
pnpm --filter @nebenkosten/web dev   # lokale Entwicklungsversion
```

### Ablauf

1. **Vorher abstimmen.** Für alles, was über einen kleinen Fehler hinausgeht,
   zuerst ein Issue eröffnen und die Lösung skizzieren. Änderungen an
   Berechnung, Schema oder Prüfregeln werden ohne vorherige Abstimmung nicht
   übernommen.
2. Einen Branch im eigenen Fork anlegen, z. B. `fix/csv-datum` oder
   `feat/bankformat-xyz`.
3. Tests zuerst schreiben; neuer ausführbarer Code braucht mindestens
   80 Prozent Abdeckung.
4. Vor dem Pull Request lokal alles prüfen:

   ```bash
   pnpm run ci
   ```

5. Pull Request gegen `main` öffnen und die Vorlage vollständig ausfüllen
   (Datenschutzprüfung, Tests, Migrationsauswirkungen).

### Fachliche und technische Regeln

Verbindlich sind [`AGENTS.md`](AGENTS.md) und die Architektur im
[Masterplan](MASTERPLAN_MIGRATION_FABLE_CODEX.md). Kurzfassung:

- Fachlogik nur in `packages/*`, nie in der UI (`apps/web`).
- Geldbeträge intern ausschließlich in **ganzen Cent**.
- Schemaänderungen nur mit vorwärtsgerichteter Migration und Tests.
- `legacy/index.html` wird **nie** verändert, formatiert oder normalisiert.
- Desktop-only: keine Mobilanpassungen
  ([ADR-0002](docs/DECISIONS/ADR-0002-DESKTOP-ONLY.md)).
- Fachliche Annahmen werden als offene Frage im Pull Request benannt, nicht
  stillschweigend im Code festgelegt.

### Arbeiten mit KI-Coding-Agenten

Claude Code, Codex, Copilot u. Ä. sind ausdrücklich erlaubt. Die Agenten lesen
[`AGENTS.md`](AGENTS.md) bzw. [`CLAUDE.md`](CLAUDE.md) automatisch. Sie bleiben
für jeden eingereichten Code verantwortlich: Prüfen Sie Diff, Tests und
Pull-Request-Text selbst, bevor Sie einreichen.

## Lizenz der Beiträge

Das Projekt steht unter der [GNU Affero General Public License v3.0](LICENSE).
Mit dem Einreichen eines Beitrags erklären Sie, dass Sie berechtigt sind, ihn
beizutragen, und dass er unter derselben Lizenz veröffentlicht wird.

## Umgang miteinander

Es gilt der [Verhaltenskodex](CODE_OF_CONDUCT.md).
