# Roadmap: Erkenntnisse aus der Abrechnung 2025 und offene Arbeiten

Stand: 16. Oktober 2026, `main` bei `bda4a82` (PR #85). Diese Datei ist die
Arbeitsliste. Wer einen Punkt beginnt, trägt Branch/PR ein; nach dem Merge
wird der Status auf „erledigt“ gesetzt. Reihenfolge = empfohlene
Bearbeitungsfolge. Je Punkt gilt die verlinkte Task-Datei (AGENTS.md Regel 1–2).

Ziel: Die App soll auch für andere private Vermieter (z. B. aus der
Immocation-Community) ohne Programmierkenntnisse eine prüffeste Abrechnung
ermöglichen – insbesondere nach einem **Objektkauf im laufenden Jahr**.

## Phase 0 – Offene Pull Requests (Stand 16. Oktober 2026)

| #   | Inhalt                                                   | Bewertung                                  | Status                                      |
| --- | -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| #69 | Dependabot: 20 Werkzeug-Updates                          | bricht Web-Typecheck (3 Checks rot)        | schließen, sobald #72 gemergt ist           |
| #72 | Werkzeug-Updates aus #69 mit Vitest-Matcher-Korrektur    | Checks grün, aber 42 Commits hinter `main` | auf `main` aktualisieren, CI prüfen, mergen |
| #76 | Heizspiegel-Vergleichswerte erfassen und im PDF ausgeben | überholt: in #82 umgesetzt (Agent A/B)     | schließen                                   |
| #79 | DWD-Klimafaktoren, PDF-Vergleich, Messentgelte           | überholt: in #82 umgesetzt (Agent A/B/D)   | schließen                                   |

## Phase 1 – Folge-PRs „Teil B“

Erledigt: PR-24 bis PR-29 Teil B mit #82 (Vergleichswerte, Klimafaktoren mit
DWD-Import, § 9b-Aufteilung nach Gradtagen, Zählertausch, Zwischenablesung,
Messentgelte); PR-HEIZKV-IMPORT und PR-HEIZKV-UI mit #74.

Offen aus TODO-HEIZKV-6A: Nr. 6 Monatliche Verbrauchsinformation
(Konzept in `docs/KONZEPT-MONATLICHE-VERBRAUCHSINFORMATION.md`), Nr. 7
Kleinigkeiten; Nr. 4 Fernwärme zurückgestellt.

## Phase 2 – Neue Punkte aus der Abrechnung 2025 (Nutzerauftrag 16.10.2026)

| Task                                           | Inhalt                                                                         | Abhängigkeit           | Status          |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------- | --------------- |
| [PR-30](PR-30-EIGENTUEMERWECHSEL.md)           | Eigentümerwechsel im Jahr: Erwerberabrechnung, Bestände FIFO, Abschlag-Warnung | –                      | Teil 1 erledigt |
| [PR-31](PR-31-ZAEHLERSTAND-PLAUSIBILITAET.md)  | Zählerstand-Plausibilität (Stellenverlust, Vertauschung, Stillstand, Rücklauf) | PR-27 (Gradtage)       | erledigt        |
| [PR-32](PR-32-ENERGIEBILANZ.md)                | Energiebilanz je Heizkreis (Nutzungsgrad, Jahresarbeitszahl)                   | –                      | erledigt        |
| [PR-33](PR-33-MEHRJAHRESVERGLEICH.md)          | Mehrjahresvergleich je Wohnung und Kostenart mit Ausreißern                    | –                      | erledigt        |
| [PR-34](PR-34-SCHAETZGRENZE-9A.md)             | § 9a Abs. 2: 25-%-Grenze vor jeder Schätzung anzeigen                          | –                      | erledigt        |
| [PR-35](PR-35-A3-FELDER-OBERFLAECHE.md)        | Prüfliste „neue Angaben nach Import“ (§ 9b-Auswahl seit #82 vorhanden)         | –                      | erledigt        |
| [PR-36](PR-36-REFERENZDATEN.md)                | DWD-Klimafaktoren und Heizspiegel als mitgelieferte Tabellen                   | –                      | in PR           |
| [PR-37](PR-37-IMPORT-BEISPIELOBJEKT.md)        | Excel/CSV-Import (Mieter, Ablesebögen, Messdienst) und anonymes Beispielobjekt | PR-HEIZKV-IMPORT       | Teil 1 erledigt |
| [PR-38](PR-38-KURZANLEITUNG-KLEINVERMIETER.md) | Kurzanleitung „Erste Abrechnung in 60 Minuten“                                 | PR-37 (Beispielobjekt) | erledigt        |

## Arbeitsweise

- Ein Task = ein Branch = ein PR; Tests zuerst; Format, Lint, Typecheck,
  Tests, Coverage, Build vor dem PR (AGENTS.md Regel 7–8).
- Unabhängige Tasks (z. B. PR-32, PR-33, PR-34, PR-38) können parallel von
  Subagenten in eigenen Worktrees bearbeitet werden; Schema-Änderungen
  (PR-30, PR-31) nacheinander, jeweils mit Migration und Tests (Regel 4).
- Keine echten Daten in Tests oder Beispielen; Beispielobjekt nur fiktiv.
