# PR-35 – Restliche Overlay-Felder in der Oberfläche

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 6. Die § 9b-Auswahl ist seit #82 vorhanden.

## Anlass

Für die Abrechnung 2025 mussten Felder per Overlay-Skript gesetzt werden
(`pnpm abrechnung --overlay`). In der Oberfläche fehlt davon noch die Auswahl
nach § 9b Abs. 3; Warmwasser, Jahresarbeitszahl, Klimafaktoren,
Vergleichswerte und Steuern/Abgaben sind vorhanden.

## Umfang

1. Nutzerwechsel ohne Zwischenablesung: Auswahl „nach Gradtagszahlen /
   zeitanteilig“ für alle Nutzungen der Wohnung gemeinsam, mit Vorschau der
   Anteile (Promille) und Hinweis, dass die Einheiten entsprechend aufgeteilt
   sein müssen.
2. Prüfliste „Neue Angaben nach Import einer Altdatei“: zeigt je Heizkreis
   fehlende Angaben (Warmwasser, § 9b, Steuern, Klimafaktor, Vergleichswert)
   mit Sprunglink.

## Freigegebene Pfade

`apps/web/src/features/consumption`, `apps/web/src/features/review`, Tests,
diese Datei. Kein Schemawechsel.

## Abnahme

Web-Tests inkl. Sperre und Audit; mindestens 80 % Abdeckung neuer Code.

## Umsetzungsstand

- Punkt 1 (§ 9b-Auswahl je Nutzerwechsel) ist seit #82 in der
  Verbrauchsseite vorhanden.
- Punkt 2: Prüfliste „Neue Angaben ergänzen“ auf der Freigabeseite
  (`apps/web/src/features/review/import-checklist.ts`): Klimafaktor des
  Jahres, Warmwasser-Wärmemenge nach § 9 Abs. 2 bei zentralem Warmwasser,
  Vergleichswerte, Steuern/Abgaben je Lieferung und § 9b-Auswahl bei
  Nutzerwechsel ohne Zwischenablesung – je mit Sprunglink. Ausgeblendet, wenn
  nichts fehlt oder der Stand schreibgeschützt ist.
