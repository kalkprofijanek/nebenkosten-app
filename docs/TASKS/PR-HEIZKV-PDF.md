# PDF-Wartung und Ergänzungen zu § 6a HeizKV

## Umfang

- Die Einzelabrechnung ist in Daten-, Tabellen-, Heizkosten- und
  Verbrauchsinformations-Bausteine aufgeteilt. `buildTenantStatement` bleibt
  der öffentliche Einstiegspunkt; die vollständige Dokumentdefinition wird
  durch einen Snapshot charakterisiert.
- Wärmemengenzähler verwenden in der Heizkosten-Aufschlüsselung,
  Verbrauchserfassung und § 6a-Verbrauchsinformation einheitlich kWh.
- Der Streitbeilegungshinweis nennt die Universalschlichtungsstelle des Bundes.
- Ein PDF-Test prüft die Hinweise nach § 6a Abs. 3 Nr. 2 und 3 auch bei einer
  reinen Flächenverteilung nach § 9a Abs. 2 HeizKV.

Schema, Berechnung und Datenverträge bleiben unverändert.

## Prüfung

- `pnpm --filter @nebenkosten/pdf typecheck`
- `pnpm --filter @nebenkosten/pdf build`
- `pnpm --filter @nebenkosten/pdf test:coverage`
- `pnpm exec prettier --check` und `pnpm exec eslint` für die geänderten
  TypeScript-Dateien.
- Ergebnis: 126 PDF-Tests bestanden. Paketabdeckung 97,71 % Zeilen; alle vier
  neuen Bausteine liegen bei mindestens 80 % für Anweisungen, Zweige und
  Funktionen.
