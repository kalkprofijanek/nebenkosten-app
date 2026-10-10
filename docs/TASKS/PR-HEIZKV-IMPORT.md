# KI-Erfassungsliste und Messdienst-CSV

Auftrag: Nutzerliste vom 10. Oktober 2026, Punkte 11 und 6 (Technik).

Freigegebene Pfade: packages/import-export, zugehörige Oberfläche in apps/web,
tests/e2e, Importformat-Dokumentation und diese Task-Datei. Keine Schema-, Core- oder
Validatoränderung. Keine produktiven Quelldateien verwenden.

Die dokumentierte KI-Erfassungsliste wird strikt gelesen, vor Übernahme
angezeigt und bestehenden Kostenarten eindeutig zugeordnet. Beträge bleiben
ganze Cent. Rückfragen, unbekannte oder mehrdeutige Kostenarten und nicht
abbildbare Lohnanteile blockieren die Übernahme statt Werte zu erfinden.
Zusatzangaben bleiben in der Belegbeschreibung erhalten. Übernahme erfolgt
atomar über den vorhandenen Bearbeitungs-/Auditpfad.

Messdienst-CSV wird ausschließlich in technische, nicht persistierte
Ablesezeilen überführt. Spaltenzuordnung und Einheit sind ausdrücklich;
proprietäre Binärformate und unbestätigte Herstellerversprechen entfallen.
Keine Umrechnung, Nutzerzuordnung, Fernablesung oder Monatsinformation.

Tests zuerst: CSV-Quoting, Grenzwerte, Datum, exakte Cent, Referenzen,
Rückfragen, Zusatzangaben, Mengen/Einheiten und Fehler ohne Originaldaten.
Format, Lint, Typecheck, Tests, Coverage und Build vor PR prüfen.
