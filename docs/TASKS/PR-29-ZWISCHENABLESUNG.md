# Hinweis „Zwischenablesung veranlassen“ bei Erfassung eines Nutzerwechsels

Stand: 10. Oktober 2026. Entscheidung:
`docs/DECISIONS/ADR-0009-ZWISCHENABLESUNG.md`.

## Teil A – Claude (dieser PR)

`tenantChanges` (Core), Prüfhinweis `heating.interim_reading_missing`.

## Teil B – Codex (Folge-PR)

1. **Nutzerbearbeitung** (`OccupancyEditor.tsx`, Ein-/Auszug): Sobald ein
   Auszugsdatum innerhalb des Abrechnungszeitraums gesetzt oder ein Einzug
   nach Periodenbeginn angelegt wird und das Jahr einen Heizkreis hat,
   deutlicher Hinweis direkt am Feld: „Zwischenablesung zum <Datum>
   veranlassen (§ 9b Abs. 1 HeizKV): Messdienst beauftragen bzw. Stände
   selbst ablesen und unter ‚Verbrauch‘ erfassen. Eine Aufteilung nach
   Gradtagen ist nur zulässig, wenn die Ablesung nicht möglich war.“
   Nicht blockierend.
2. **Verbrauchsseite:** Zeilen von Wechseln ohne Zwischenablesung
   (`tenantChanges(...).hasInterimReading === false`) markieren; Filter
   „Nur offene und abweichende Zeilen“ berücksichtigt sie.
3. **Aufteilung nach Gradtagen** (PR-27 Teil B): vor der Übernahme
   Pflichtfeld „Warum war keine Zwischenablesung möglich?“; der Text wird
   der Erläuterung vorangestellt.
4. **Tests:** Hinweis erscheint bei Auszugsdatum im Jahr, nicht ohne
   Heizkreis und nicht bei erfasster Ablesung.
