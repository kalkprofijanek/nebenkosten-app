# Vergleichswerte: Erfassung und PDF-Ausgabe

Folgeauftrag nach Merge von #73, entsprechend PR-24 Teil B und der
Zuständigkeitsteilung des Nutzers vom 10. Oktober 2026.

Freigegebene Pfade: apps/web, packages/pdf, tests/e2e, zugehörige Tests und
Benutzerdokumentation. Keine Schema-, Core-, Validator- oder
Abhängigkeitsänderungen. Dieser PR baut auf #74 auf.

Die optionale Erfassung am Heizkreis verwendet das bestehende Schema.
Speichern, Ändern und ausdrückliches Entfernen müssen funktionieren;
normale Heizkreisänderungen ohne Referenz bleiben möglich. Die fachliche
Eignung einer Quelle wird nicht automatisch behauptet.

Das PDF verwendet ausschließlich
`compareTenantWithConsumptionBenchmark`. Quelle, Kategorie, Bezugsjahr,
Warmwasserbezug, Jahreshochrechnung und auf den Nutzungszeitraum
umgerechnete Klassengrenzen werden ausgewiesen. Bei nicht berechenbarem
Vergleich entfällt die Zeile. Bestehende PDF-Ausgaben ohne Referenz bleiben
durch den vollständigen Dokument-Snapshot abgesichert.

Tests: Erfassen/Ändern/Entfernen, ungültige Grenzen, Bearbeitung ohne
Referenz; PDF mit und ohne Vergleich, Teilzeitraum und Warmwasserbezug.
Format, Lint, Typecheck, Tests, Coverage, Build und Browserprüfung vor
Abschluss prüfen.

Offene Übergabe an Claude: Den bisher pauschalen Hinweis
`heating.consumption_benchmark_missing` gemäß PR-24 Teil B Nr. 2 nur bei
Heizkreisen ohne Referenz melden. Validatoren gehören gemäß Nutzerauftrag
zu Claudes Paket. Der Status der gesamten HeizKV-Vollständigkeit wird
deshalb nicht auf „erfüllt“ gesetzt.
