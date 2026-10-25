# PR-40 – Rechnungseingangsordner je Objekt verknüpfen

Stand: 17. Oktober 2026. Auftrag: Roadmap Phase 3, Punkt 2 (Priorität 2).
Abhängigkeit: PR-43 (Datenschutzregeln) vor der Umsetzung abstimmen.

## Ziel

Pro Objekt wird ein **bestehender** lokaler Ordner hinterlegt, in dem die
Eingangsrechnungen bereits liegen. Es entsteht **keine** eigene
Belegablage, kein Uploadarchiv und keine neue Datenbank. Die Originale
bleiben an ihrem Speicherort.

Beispielstruktur (fiktiv):

```
<Basisordner>\
  ├── Objekt-A\Rechnungseingang\
  └── Objekt-B\Rechnungseingang\
```

## Zwei Zugriffswege

| Weg                                     | Zugriff                                                                                                                               | Speicherort der Zuordnung                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| KI-Agent lokal (Claude Code, Codex)     | liest den Pfad direkt                                                                                                                 | private Datei `private-data/objekt-ordner.json` (ignoriert, nie committet) |
| Browser-App (GitHub Pages, Edge/Chrome) | nur nach Freigabe über Ordnerdialog (File System Access API, `showDirectoryPicker`), Lesezugriff, je Sitzung ggf. erneute Bestätigung | Ordner-Handle in IndexedDB des Browsers; kein Pfad, keine Übertragung      |

Firefox und Safari unterstützen den Ordnerdialog nicht; dort bleibt der
Agenten-Weg bzw. die bisherige Erfassung.

## Entscheidungen (Nutzer, 17.10.2026)

- **E-40-1:** Der Ordner dient **nur der Prüfung**. Keine Dateiansicht und
  kein Belegarchiv in der App.
- **E-40-2:** Das Abrechnungsjahr ergibt sich aus dem **Leistungszeitraum**,
  weil Rechnungen oft erst später eingehen. Keine Unterordner je Jahr
  vorgegeben; Dateien ohne Kostenposition werden jahresunabhängig gelistet.
- **E-41-1:** Verknüpfung über das vorhandene Feld `receiptReference`
  („Belegnummer/Dateiname“) – keine Schemaänderung, keine Migration.

## Vertrag (umgesetzt, Agentenweg)

- Private Zuordnungsdatei `private-data/objekt-ordner.json`:
  `{ "version": 1, "objects": [{ "propertyId": "…", "invoiceFolder": "…" }] }`
  – Schlüssel ist die `propertyId` der Datendatei, kein Objektname;
  relative Pfade gelten relativ zur Zuordnungsdatei.
- `packages/validators`: `parseReceiptFolderMapping(value)` und
  `checkReceiptFolder(data, { billingPeriodId, files })` – rein, ohne
  Dateizugriff. Ergebnis: `matched`, `withoutReference` (Schätzungen
  ausgenommen), `notFound`, `duplicates`, `unreferencedFiles`.
- Abgleich ohne Groß-/Kleinschreibung über Pfad, Dateiname oder Dateiname
  ohne Endung; Kostenpositionen und Brennstofflieferungen.
- Skript `pnpm belegpruefung <datendatei> [--jahr] [--zuordnung] [--json]`:
  liest Ordner rekursiv (ohne System-/Sperrdateien), nur lesend.
- Anleitung `docs/BELEGPRUEFUNG.md`, Verweis in `docs/KI-ANLEITUNG.md`.

## Zurückgestellt: Browser-Ordnerdialog

Weil der Ordner nur der Prüfung dient und die Prüfung lokal über das
Skript läuft, wird der Ordnerdialog in der Browser-App (File System Access
API, nur Edge/Chrome, Freigabe je Sitzung) vorerst nicht gebaut. Er wäre
ein eigener PR: Ordner-Handle nur in IndexedDB, nicht in Datensicherung,
Export oder Schema.

## Freigegebene Pfade

`packages/validators/`, `scripts/belegpruefung.mjs`, `package.json`
(Skripteintrag), `docs/`, `CHANGELOG.md`.

## Tests / Abnahme

- Unit (`packages/validators/tests/receipt-folder.test.ts`): Zuordnungsdatei
  gültig/ungültig, Abgleich über Pfad/Name/Name ohne Endung, fehlende
  Angabe, nicht gefunden, Mehrfachverwendung, Schätzung ausgenommen,
  Brennstofflieferungen, andere Zeiträume, unbekannter Zeitraum.
- Manuell: Skript mit fiktiven Daten und Testordner (Unterordner,
  `.DS_Store`, `~$`-Sperrdatei) ausgeführt.
