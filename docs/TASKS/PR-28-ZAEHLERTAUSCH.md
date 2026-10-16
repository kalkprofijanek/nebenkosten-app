# Geräte- und Zählertausch erfassen und ausweisen

Stand: 10. Oktober 2026. Entscheidung:
`docs/DECISIONS/ADR-0008-ZAEHLERTAUSCH.md`.

## Teil A – Claude (dieser PR)

- `packages/schema`: `meterReplacementSchema`,
  `HeatMeterReading.replacements`.
- `packages/core`: `meterReadingConsumption`, `meterReadingTotal`.
- `packages/validators`: Abweichungsprüfung über den Core,
  `heating.meter_replacement_invalid`.
- `packages/pdf/src/meter-readings.ts` (`readingDifference`) und
  `apps/web/src/features/consumption/overview.ts` rechnen über den Core
  (keine sichtbare Änderung ohne Tausch).

## Teil B – Codex (Folge-PR)

1. **Verbrauchsseite** (`ConsumptionRoute.tsx`, `updateOccupancyConsumption`
   in `apps/web/src/features/occupancies/commands.ts`): je Zeile „Zähler
   getauscht“ mit Tauschdatum, Endstand alt, neue Nummer, Anfangsstand neu
   (mehrfach möglich); `replacements` in den erlaubten Feldern des Befehls
   ergänzen. „Verbrauch aus Zählerständen übernehmen“ nutzt
   `meterReadingTotal`. Fehlermeldung bei `invalid`.
2. **Einzelabrechnung** („Ihre Verbrauchserfassung“, `readingCells`) und
   **Gesamtabrechnung** (`circuitMeterReadingTables`): bei Tausch eine Zeile
   je Abschnitt aus `meterReadingConsumption(...).segments` (Nummer, Stand
   alt mit Datum, Stand neu mit Datum, Verbrauch) und eine Summenzeile.
3. **Tests:** Befehl mit Tausch, Oberfläche, PDF-Zeilen; fiktive Nummern.
4. **Doku:** Benutzerhandbuch, README „Was noch fehlt“ (Zählertausch
   streichen), CHANGELOG.
