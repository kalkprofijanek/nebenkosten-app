# Roadmap: Erkenntnisse aus der Abrechnung 2025 und offene Arbeiten

Stand: 16. Oktober 2026, `main` bei `bda4a82` (PR #85). Diese Datei ist die
Arbeitsliste. Wer einen Punkt beginnt, trägt Branch/PR ein; nach dem Merge
wird der Status auf „erledigt“ gesetzt. Reihenfolge = empfohlene
Bearbeitungsfolge. Je Punkt gilt die verlinkte Task-Datei (AGENTS.md Regel 1–2).

Ziel: Die App soll auch für andere private Vermieter (z. B. aus der
Immocation-Community) ohne Programmierkenntnisse eine prüffeste Abrechnung
ermöglichen – insbesondere nach einem **Objektkauf im laufenden Jahr**.

## Phase 0 – Offene Pull Requests abschließen

| #         | Inhalt                                                                    | Status          |
| --------- | ------------------------------------------------------------------------- | --------------- |
| #69 / #72 | Werkzeug-Updates (Vitest-Matcher-Korrektur)                               | offen (Entwurf) |
| #76       | Heizspiegel-Vergleichswerte erfassen und im PDF ausgeben (PR-24 Teil B)   | offen (Entwurf) |
| #79       | DWD-Klimafaktoren erfassen, PDF-Vergleich, Messentgelte (PR-25/26 Teil B) | offen (Entwurf) |

Vor dem Fortsetzen jeweils gegen `main` (nach #85) aktualisieren; #85 hat
`tenant-statement-*.ts` und `scripts/abrechnung.mjs` geändert.

## Phase 1 – Bereits beschlossene Folge-PRs („Teil B“)

| Task                       | Inhalt                                                                                  | Status                                 |
| -------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| PR-27 Teil B               | § 9b Abs. 3: Auswahl „Gradtagszahlen/zeitanteilig“ beim Nutzerwechsel in der Oberfläche | offen → in PR-35 enthalten             |
| PR-28 Teil B               | Zählertausch erfassen (Tauschdatum, Endstand alt, Anfangsstand neu)                     | offen                                  |
| PR-29 Teil B               | Zwischenablesung erfassen, Filter „offene/abweichende Zeilen“                           | offen                                  |
| PR-HEIZKV-IMPORT           | KI-Erfassungsliste und Messdienst-CSV                                                   | prüfen, ob umgesetzt; sonst in PR-37   |
| PR-HEIZKV-UI               | Vorjahresverbrauch erfassen, kWh-Beschriftung, CostsRoute aufteilen                     | prüfen, ob umgesetzt                   |
| TODO-HEIZKV-6A Nr. 3, 6, 7 | Warmwasser-Energie je Nutzer, Monatsinformation, Kleinigkeiten                          | offen (Nr. 4 Fernwärme zurückgestellt) |

## Phase 2 – Neue Punkte aus der Abrechnung 2025 (Nutzerauftrag 16.10.2026)

| Task                                           | Inhalt                                                                         | Abhängigkeit           | Status |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------- | ------ |
| [PR-30](PR-30-EIGENTUEMERWECHSEL.md)           | Eigentümerwechsel im Jahr: Erwerberabrechnung, Bestände FIFO, Abschlag-Warnung | –                      | offen  |
| [PR-31](PR-31-ZAEHLERSTAND-PLAUSIBILITAET.md)  | Zählerstand-Plausibilität (Stellenverlust, Vertauschung, Stillstand, Rücklauf) | PR-27 (Gradtage)       | offen  |
| [PR-32](PR-32-ENERGIEBILANZ.md)                | Energiebilanz je Heizkreis (Nutzungsgrad, Jahresarbeitszahl)                   | –                      | offen  |
| [PR-33](PR-33-MEHRJAHRESVERGLEICH.md)          | Mehrjahresvergleich je Wohnung und Kostenart mit Ausreißern                    | –                      | offen  |
| [PR-34](PR-34-SCHAETZGRENZE-9A.md)             | § 9a Abs. 2: 25-%-Grenze vor jeder Schätzung anzeigen                          | –                      | offen  |
| [PR-35](PR-35-A3-FELDER-OBERFLAECHE.md)        | Restliche Overlay-Felder in der Oberfläche (§ 9b, Prüfliste)                   | PR-27 Teil B           | offen  |
| [PR-36](PR-36-REFERENZDATEN.md)                | DWD-Klimafaktoren und Heizspiegel als mitgelieferte Tabellen                   | #76, #79               | offen  |
| [PR-37](PR-37-IMPORT-BEISPIELOBJEKT.md)        | Excel/CSV-Import (Mieter, Ablesebögen, Messdienst) und anonymes Beispielobjekt | PR-HEIZKV-IMPORT       | offen  |
| [PR-38](PR-38-KURZANLEITUNG-KLEINVERMIETER.md) | Kurzanleitung „Erste Abrechnung in 60 Minuten“                                 | PR-37 (Beispielobjekt) | offen  |

## Arbeitsweise

- Ein Task = ein Branch = ein PR; Tests zuerst; Format, Lint, Typecheck,
  Tests, Coverage, Build vor dem PR (AGENTS.md Regel 7–8).
- Unabhängige Tasks (z. B. PR-32, PR-33, PR-34, PR-38) können parallel von
  Subagenten in eigenen Worktrees bearbeitet werden; Schema-Änderungen
  (PR-30, PR-31) nacheinander, jeweils mit Migration und Tests (Regel 4).
- Keine echten Daten in Tests oder Beispielen; Beispielobjekt nur fiktiv.
