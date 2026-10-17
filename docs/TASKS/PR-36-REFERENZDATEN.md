# PR-36 – Mitgelieferte Referenzdaten (DWD-Klimafaktoren, Heizspiegel)

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 7. Der DWD-Dateiimport ist seit #82 vorhanden.

## Anlass

Die App hat bewusst keinen Netzzugriff (Content Security Policy
`connect-src none`). Klimafaktoren je PLZ und Heizspiegel-Werte mussten 2025
manuell beschafft werden.

## Umfang

1. Build-Skript lädt zur Release-Zeit die DWD-Jahresdateien
   (`KF_JJJJ0101_JJJJ1231.csv`) und erzeugt eine kompakte Tabelle
   PLZ → Faktor je Jahr als statische Datei im Build (mit Quelle und
   Abrufdatum).
2. Heizspiegel-Kategorien als gepflegte Tabelle mit Quelle und Jahr.
3. Oberfläche: Vorschlag aus der Objekt-PLZ, Übernahme erst nach Bestätigung
   (wie #79).

## Freigegebene Pfade

`scripts/`, statisches Datenmodul in `apps/web`,
`apps/web/src/features/billing-periods`, `apps/web/src/features/workflows/heating`,
Tests, diese Datei.

## Abnahme

Lizenz und Quelle der Daten dokumentiert; Tests für Parser und Vorschlag;
Auswirkung auf die Build-Größe dokumentiert.

## Entscheidung (17. Oktober 2026)

Nutzerentscheidung: Referenzdaten werden **nicht mitgeliefert**, sondern
verlinkt; im KI-Ablauf ruft der Agent die Werte selbst aus der Originalquelle
ab (mit Fundstelle und Abrufdatum). Damit entfallen Build-Skript, Lizenzfrage
der Heizspiegel-Daten (kommerzielle Nutzung nur mit Genehmigung von
co2online) und die Zunahme der Build-Größe.

## Umsetzungsstand

- `docs/DATENQUELLEN.md`: Quellen für Klimafaktoren (DWD Open Data),
  Vergleichswerte (Heizspiegel), Gradtagszahlen (in der App), CO₂-Preis
  (DEHSt), Rechnungsangaben und Rechtsgrundlagen.
- Oberfläche: Quellenhinweis mit Link unter „Klimafaktor (DWD)“ und
  „Vergleichswerte (Heizspiegel)“ (`apps/web/src/features/reference-sources.ts`).
- `docs/KI-ANLEITUNG.md`: Schritt „Referenzwerte selbst abrufen“ und Regel 11
  der Arbeitsanweisung.
