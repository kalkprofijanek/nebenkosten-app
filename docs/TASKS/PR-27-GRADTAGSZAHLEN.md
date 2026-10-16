# Aufteilung nach Gradtagszahlen bei Nutzerwechsel (§ 9b Abs. 2 HeizKV)

Stand: 10. Oktober 2026. Entscheidung:
`docs/DECISIONS/ADR-0007-GRADTAGSZAHLEN.md`.

## Teil A – Claude (dieser PR)

`packages/core`: `DEGREE_DAY_PERMILLE`, `SUMMER_DEGREE_DAY_PERMILLE`,
`degreeDayPermille`, `splitByDegreeDays`; `compareTenantWithConsumptionBenchmark`
mit optionalem Parameter `usage` und Ergebnisfeld `annualization`.

## Teil B – Codex (Folge-PR)

1. **Verbrauchsseite** (`apps/web/src/features/consumption`): Für eine
   Wohnung mit mehreren Nutzungen im Jahr (Mieter und Leerstand) Knopf
   „Nach Gradtagszahlen aufteilen“. Eingabe: Gesamtverbrauch der Wohnung laut
   Jahresablesung. Vorschau je Nutzung mit Zeitraum, Promille und Anteil;
   Übernahme schreibt `consumptionUnits` je Nutzung und den Erläuterungstext
   in `consumptionUnitsEstimateReason`, z. B. „Aufteilung nach
   Gradtagszahlen (§ 9b Abs. 2 HeizKV, VDI 2067): 1.000 Einheiten ×
   450 ‰ ÷ 1.000 ‰ = 450 Einheiten“. `consumptionUnitsEstimated` **nicht**
   setzen (keine Schätzung nach § 9a). Zeiträume: `from`/`to` der Nutzung,
   leer = Beginn/Ende des Abrechnungszeitraums. Die Zeiträume müssen das Jahr
   lückenlos abdecken, sonst Fehlermeldung.
2. **PDF** (Vergleich mit dem Durchschnittsnutzer, PR-24 Teil B):
   `usage` mit Nutzungs- und Abrechnungszeitraum übergeben; Fußnote bei
   `annualization === 'degree_days'`: „Heizwärme nach Gradtagszahlen
   (VDI 2067), Warmwasser nach Tagen auf ein Jahr hochgerechnet“.
3. **Tests:** Befehl (Aufteilung, Lücke, Leerstand), Oberflächentest der
   Vorschau, PDF-Text.
4. **Doku:** Benutzerhandbuch, README „Was noch fehlt“ (Punkt
   Gradtag-Aufteilung streichen), CHANGELOG.
