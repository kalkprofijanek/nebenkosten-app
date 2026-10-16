# PR-35 – Restliche Overlay-Felder in der Oberfläche

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 6; enthält PR-27 Teil B.

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
