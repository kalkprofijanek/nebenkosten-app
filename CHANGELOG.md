# Changelog

Alle wesentlichen Änderungen dieses Projekts werden hier dokumentiert.

## 1.0.1 – in Vorbereitung

- migrierte Kostenarten mit Umlageschlüssel, Positionszahl und Gesamtbetrag
  sichtbar,
- Kostenpositionen mit Datum, Beschreibung, Belegreferenz und Betrag sichtbar,
- Bankbuchungen des aktiven Objekts/Jahres einschließlich offener Zuordnungen
  sichtbar,
- Pagination für lange produktive Listen,
- indirekte Build-Abhängigkeit `nanoid` auf die gepatchte Version 3.3.17
  festgesetzt.

## 1.0.0 – 7. August 2026

- kontrollierte Legacy-v3-zu-v4-Migration ohne stillen Feldverlust,
- deterministische Nebenkosten-, Heizkosten- und CO₂-Berechnung in Cent,
- lokale Persistenz, Snapshots, Backup und atomare Wiederherstellung,
- Prüf- und Freigabeablauf mit unveränderlichen Berechnungssnapshots,
- Einzelabrechnungen, Gesamtabrechnung, PDF- und ZIP-Export,
- produktiver lokaler Migrations- und Vergleichsablauf ohne Daten im Git,
- reproduzierbarer, datenschutzgeprüfter statischer Release-Build,
- vorbereiteter manueller GitHub-Pages-Workflow.

Bekannte Grenzen: keine Cloud, keine Anmeldung, kein Mehrbenutzerbetrieb, keine
serverseitige Speicherung und keine automatische rechtliche Freigabe.
