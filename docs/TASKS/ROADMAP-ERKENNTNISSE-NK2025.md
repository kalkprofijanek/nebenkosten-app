# Roadmap: Erkenntnisse aus der Abrechnung 2025 und offene Arbeiten

Stand: 25. Oktober 2026, `main` bei `b580222` (PR #111); zuvor 16. Oktober
2026 (`bda4a82`, PR #85). Diese Datei ist die
Arbeitsliste. Wer einen Punkt beginnt, trägt Branch/PR ein; nach dem Merge
wird der Status auf „erledigt“ gesetzt. Reihenfolge = empfohlene
Bearbeitungsfolge. Je Punkt gilt die verlinkte Task-Datei (AGENTS.md Regel 1–2).

Ziel: Die App soll auch für andere private Vermieter (z. B. aus der
Immocation-Community) ohne Programmierkenntnisse eine prüffeste Abrechnung
ermöglichen – insbesondere nach einem **Objektkauf im laufenden Jahr**.

## Phase 0 – Offene Pull Requests (Stand 25. Oktober 2026)

Die am 16. Oktober 2026 gelisteten PRs #69, #72, #76 und #79 sind erledigt.

| #    | Inhalt                                                     | Bewertung                            | Status                               |
| ---- | ---------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| #101 | Zählerstände aus Ablesebogen/Messdienst-CSV (PR-37 Teil 3) | seit 17.10.2026 offen, hinter `main` | auf `main` aktualisieren, CI prüfen  |
| #106 | Dependabot: 14 Werkzeug-Updates                            | wie #69 auf Typecheck-Brüche prüfen  | CI prüfen, ggf. Korrektur-PR wie #72 |

## Phase 1 – Folge-PRs „Teil B“

Erledigt: PR-24 bis PR-29 Teil B mit #82 (Vergleichswerte, Klimafaktoren mit
DWD-Import, § 9b-Aufteilung nach Gradtagen, Zählertausch, Zwischenablesung,
Messentgelte); PR-HEIZKV-IMPORT und PR-HEIZKV-UI mit #74.

Aus TODO-HEIZKV-6A: Nr. 6 Monatliche Verbrauchsinformation erledigt
(PR-46, #107, #108). Offen: Nr. 7 Kleinigkeiten (Test § 6a-Block bei reiner
Flächenverteilung); Nr. 4 Fernwärme zurückgestellt.

## Phase 2 – Neue Punkte aus der Abrechnung 2025 (Nutzerauftrag 16.10.2026)

| Task                                           | Inhalt                                                                         | Abhängigkeit           | Status              |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------- | ------------------- |
| [PR-30](PR-30-EIGENTUEMERWECHSEL.md)           | Eigentümerwechsel im Jahr: Erwerberabrechnung, Bestände FIFO, Abschlag-Warnung | –                      | erledigt            |
| [PR-31](PR-31-ZAEHLERSTAND-PLAUSIBILITAET.md)  | Zählerstand-Plausibilität (Stellenverlust, Vertauschung, Stillstand, Rücklauf) | PR-27 (Gradtage)       | erledigt            |
| [PR-32](PR-32-ENERGIEBILANZ.md)                | Energiebilanz je Heizkreis (Nutzungsgrad, Jahresarbeitszahl)                   | –                      | erledigt            |
| [PR-33](PR-33-MEHRJAHRESVERGLEICH.md)          | Mehrjahresvergleich je Wohnung und Kostenart mit Ausreißern                    | –                      | erledigt            |
| [PR-34](PR-34-SCHAETZGRENZE-9A.md)             | § 9a Abs. 2: 25-%-Grenze vor jeder Schätzung anzeigen                          | –                      | erledigt            |
| [PR-35](PR-35-A3-FELDER-OBERFLAECHE.md)        | Prüfliste „neue Angaben nach Import“ (§ 9b-Auswahl seit #82 vorhanden)         | –                      | erledigt            |
| [PR-36](PR-36-REFERENZDATEN.md)                | DWD-Klimafaktoren und Heizspiegel als mitgelieferte Tabellen                   | –                      | erledigt            |
| [PR-37](PR-37-IMPORT-BEISPIELOBJEKT.md)        | Excel/CSV-Import (Mieter, Ablesebögen, Messdienst) und anonymes Beispielobjekt | PR-HEIZKV-IMPORT       | Teil 3 in PR (#101) |
| [PR-38](PR-38-KURZANLEITUNG-KLEINVERMIETER.md) | Kurzanleitung „Erste Abrechnung in 60 Minuten“                                 | PR-37 (Beispielobjekt) | erledigt            |
| [PR-44](PR-44-MEDIEN-MUSTERABRECHNUNG.md)      | Screenshots, Bedienhinweise und Musterabrechnungen (ADR-0012)                  | PR-37, PR-38           | erledigt            |

## Phase 3 – Schlanke Erweiterungen (Nutzerauftrag 17.10.2026)

Leitlinie: Die App erstellt die Nebenkostenabrechnung zuverlässig; sie wird
keine vollständige Hausverwaltungssoftware. Stärke bleibt die Kombination
aus geprüfter Abrechnungsengine und lokalem KI-Agenten.

| Funktion                                          | Entscheidung                        |
| ------------------------------------------------- | ----------------------------------- |
| EPC-GiroCode für Nachzahlungen                    | umsetzen (PR-39)                    |
| Rechnungseingangsordner je Objekt verknüpfen      | umsetzen (PR-40)                    |
| KI-gestützte Belegauswertung aus diesem Ordner    | vorhandenen Workflow nutzen (PR-41) |
| Belegprüfung (Kosten ohne Rechnung und umgekehrt) | umsetzen (PR-41)                    |
| Fristenübersicht mit Kalenderexport               | nicht umsetzen (Nutzer, 21.10.2026) |
| Datenschutz bei der Verarbeitung mit KI           | erledigt (PR-43)                    |
| Korrigierte Abrechnungen / Versionsvergleich      | nicht umsetzen                      |
| Steuerliche Anlage-V-Auswertung                   | nicht umsetzen                      |
| Eigenständige Belegverwaltung mit Uploadarchiv    | nicht notwendig                     |
| Neue Datenbank oder Windows-Anwendung             | nicht notwendig                     |

| Task                                                 | Inhalt                                                                       | Abhängigkeit | Status                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| [PR-39](PR-39-GIROCODE.md)                           | GiroCode (EPC-QR) bei Nachzahlung; E-39-1/-2 entschieden (A/A)               | –            | erledigt (#100)                              |
| [PR-40](PR-40-RECHNUNGSORDNER-JE-OBJEKT.md)          | Rechnungsordner je Objekt verknüpfen, nur zur Prüfung (Agentenweg)           | PR-43        | erledigt (#105)                              |
| [PR-41](PR-41-KI-BELEGWORKFLOW-UND-BELEGPRUEFUNG.md) | KI-Workflow aus dem Objektordner und Belegprüfung                            | PR-40, PR-43 | Belegprüfung erledigt (#105)                 |
| [PR-42](PR-42-FRISTENUEBERSICHT.md)                  | Fristen nach § 556 Abs. 3 BGB mit `.ics`-Export                              | –            | verworfen                                    |
| [PR-43](PR-43-DATENSCHUTZ-KI-VERARBEITUNG.md)        | Datenschutz bei KI (`docs/DATENSCHUTZ-KI.md`); Nutzer entscheidet je Schritt | –            | erledigt                                     |
| [PR-45](PR-45-WASSER-NACH-ZAEHLER.md)                | Umlageschlüssel „Wasserverbrauch“ (§ 556a Abs. 1 Satz 2 BGB, ADR-0013)       | –            | erledigt (#103); E-45 entschieden 25.10.2026 |
| [PR-46](PR-46-MONATSINFORMATION.md)                  | Monatliche Verbrauchsinformation § 6a HeizKV (ADR-0014), Schritt 3 von 3     | –            | erledigt (#107, #108)                        |

Reihenfolge: PR-39 → PR-43 (Regeln festlegen) → PR-40 → PR-41. PR-42
verworfen (Nutzer, 21.10.2026).

## Phase 4 – Sicherheitshärtung (Audit 28.10.2026)

Grundlage: Sicherheitsaudit mit dem Cloudflare `security-audit-skill`
(Profil quick, beschränkt auf `packages/`, `scripts/`, `.github/`;
Quellstand `cce033c`). Im geprüften Umfang gibt es keinen bestätigten Befund,
aber zwei offene Spuren (PR-47, PR-49) und mehrere Härtungshinweise. Der
Auditbericht liegt nicht im Repository (`SECURITY.md`).

| Task                                            | Inhalt                                                                     | Abhängigkeit | Status |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ------------ | ------ |
| [PR-47](PR-47-PDF-INHALTE-HAERTEN.md)           | PDF-Inhalte nur aus geprüften Werten (Snapshot-Prüfung, Textzwang)         | –            | offen  |
| [PR-49](PR-49-EIGENE-HERKUNFT-UND-PAGES.md)     | Eigene Browser-Herkunft statt geteiltem github.io; Pages-Deploy absichern  | Inhaber (A)  | offen  |
| [PR-48](PR-48-RECHENLAUF-AN-EINGABEN-BINDEN.md) | Rechenlauf per `inputSha256` an Eingaben binden; Import gesperrter Stände  | PR-47        | offen  |
| [PR-51](PR-51-IMPORT-ROBUSTHEIT.md)             | CSV-Dezimaltrennzeichen, Personenzahl, Legacy-IDs, Nachschlagetabellen     | –            | offen  |
| [PR-52](PR-52-EXPORTDATEIEN-UND-SNAPSHOTS.md)   | Eindeutige PDF-Dateinamen, Aufbewahrung zukünftiger Snapshots              | –            | offen  |
| [PR-50](PR-50-CI-RELEASE-HAERTUNG.md)           | Install-Skripte, pnpm-Hash, Archivprüfer, `.gitignore`, Vite ohne HMR      | –            | offen  |
| [PR-53](PR-53-SECURITY-AUDIT-FOLGELAUF.md)      | Folgelauf (standard) über `apps/web`, `packages/core` und Zurückgestelltes | PR-47–PR-49  | offen  |

Reihenfolge = Tabellenfolge. Vor dem Start entscheidet der Nutzer E-47-1,
E-48-1 bis E-48-3, E-49-1, E-51-1 bis E-51-4 und E-52-1. PR-49 Teil A
(Pages-Seiten im Konto prüfen, Environment auf `main` beschränken) braucht
keinen Code und kann sofort erledigt werden.

## Arbeitsweise

- Ein Task = ein Branch = ein PR; Tests zuerst; Format, Lint, Typecheck,
  Tests, Coverage, Build vor dem PR (AGENTS.md Regel 7–8).
- Unabhängige Tasks (z. B. PR-32, PR-33, PR-34, PR-38) können parallel von
  Subagenten in eigenen Worktrees bearbeitet werden; Schema-Änderungen
  (PR-30, PR-31) nacheinander, jeweils mit Migration und Tests (Regel 4).
- Keine echten Daten in Tests oder Beispielen; Beispielobjekt nur fiktiv.
