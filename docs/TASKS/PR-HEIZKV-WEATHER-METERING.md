# Witterungsvergleich und Messdienstentgelte

Folgeauftrag nach Merge von #75, gemäß PR-25 und PR-26 sowie der
Zuständigkeitsteilung des Nutzers. Aufbau auf #76.

Freigegebene Pfade: apps/web, packages/pdf, packages/import-export,
zugehörige Tests, tests/e2e und Benutzerdokumentation. Keine Schema-,
Core-, Validator- oder Abhängigkeitsänderungen.

Die Erfassung von Klimafaktoren am Abrechnungsjahr und beim gespeicherten
Vorjahresverbrauch bleibt optional. DWD-CSV wird nach ADR-0005 gelesen;
Zeitraum und Postleitzahl müssen geprüft werden. Die PDF-Ausgabe verwendet
die Core-Funktionen und fällt bei fehlenden oder unpassenden Faktoren auf
die bestehende unbereinigte Darstellung zurück.

Messdienstentgelte erhalten die vorhandene optionale Kennzeichnung an
Heizungs-Kostenarten. Automatische Erkennung, ausdrückliches Ja und Nein
bleiben unterscheidbar. Das Kennzeichen wird angezeigt und über den
vorhandenen Befehls-/Bearbeitungspfad gespeichert.

Tests: DWD-Formate, führende Nullen, realistische Listengröße mit erzeugten
fiktiven Zeilen, Formatfehler; Faktoren speichern/entfernen, Vorjahreswert,
Messentgelt-Zustände; PDF mit passenden und unpassenden Faktoren.
Format, Lint, Typecheck, vollständige Tests, Coverage, Build, Datenschutz,
Audit und Browserabläufe vor Abschluss prüfen.

Offen bei Claude: Validatorhinweis
`heating.previous_period_not_weather_adjusted` gemäß PR-25 Teil B Nr. 4
ergänzen. Die Validatoranpassung zum Benchmark ist ebenfalls noch offen;
beide bleiben in Claudes Zuständigkeit.
