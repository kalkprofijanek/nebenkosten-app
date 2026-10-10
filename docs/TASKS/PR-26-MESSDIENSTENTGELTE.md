# Entgelte für Verbrauchserfassung kennzeichnen (§ 6a Abs. 3 Nr. 1c HeizKV)

Stand: 10. Oktober 2026. Entscheidung:
`docs/DECISIONS/ADR-0006-MESSDIENSTENTGELTE.md`.

## Änderungsgrund

Der Betrag der Messdienstentgelte fehlt in der Einzelabrechnung ohne Hinweis,
wenn die Kostenart keines der Schlagworte trägt.

## Teil A – Claude (dieser PR)

- `packages/schema`: `CostCategory.meteringFee` (optional).
- `packages/core`: `METERING_FEE_PATTERN`, `isMeteringFeeCategory`,
  `meteringFeeCents` (aus `packages/pdf/src/heating-summary.ts` verlegt,
  Kennzeichen hat Vorrang).
- `packages/pdf/src/heating-summary.ts`: exportiert `meteringFeeCents` aus
  dem Core weiter (keine Änderung der Ausgabe).
- `packages/validators`: `heating.metering_fee_not_identified`.
- `apps/web/src/features/costs/commands.ts`: Kennzeichen wird ins Folgejahr
  übernommen (`CARRY_OVER_KEYS`).

## Teil B – Codex (Folge-PR)

1. **Oberfläche** (Kostenart bearbeiten, nur bei Art „Heizung“): Auswahl
   „Entgelt für Verbrauchserfassung und Abrechnung (§ 6a HeizKV)“ mit
   „automatisch erkennen“ (leer), „ja“ (`true`), „nein“ (`false`);
   `CATEGORY_KEYS` und `parseCategoryInput` in
   `apps/web/src/features/costs/commands.ts` um `meteringFee` erweitern.
   In der Übersicht der Heizkosten anzeigen, welche Kostenarten als Entgelt
   zählen (`isMeteringFeeCategory`).
2. **Prüflink:** `heating.metering_fee_not_identified` führt zu den
   Heizungs-Kostenarten des Gebäudes.
3. **Tests:** Oberflächentest Setzen/Zurücksetzen; Befehlstest mit `true`,
   `false` und leer.
4. **Doku:** Benutzerhandbuch, CHANGELOG.

## Migrationsauswirkungen

Keine Migration; additives optionales Feld.
