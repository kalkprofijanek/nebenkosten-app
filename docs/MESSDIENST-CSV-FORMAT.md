# Messdienst-CSV technisch lesen

`parseMeterServiceCsv(text, columns)` im Paket `@nebenkosten/import-export`
liest CSV mit Semikolon und UTF-8. Die vier Spalten werden ausdrücklich
über ihre exakten Überschriften zugeordnet, zum Beispiel:

```ts
parseMeterServiceCsv(text, {
  meterNumber: 'Zählernummer',
  date: 'Ablesedatum',
  value: 'Zählerstand',
  unit: 'Einheit',
})
```

```csv
Zählernummer;Ablesedatum;Zählerstand;Einheit
TEST-1;31.01.2026;1.234,5;kWh
TEST-2;2026-01-31;12,5;m3
```

Hersteller wie Techem und ista bieten unterschiedliche Exportformate an.
Dieser Parser unterstützt tabellarische Exporte, deren Zählernummer,
Ablesedatum, kumulierter Stand und Einheit explizit zugeordnet werden können.
Es gibt keine behauptete Kompatibilität mit jedem Herstellerexport. Echte
Exportvorlagen müssen lokal auf Spalten und Bedeutung geprüft werden.
Proprietäre Formate, PDF, XLSX und Monatsverbrauchsspalten werden nicht
automatisch erkannt oder als Zählerstände interpretiert.

Ergebnis: technische Zeilen `{ meterNumber, date, value, unit }`. Zulässige
Einheiten sind exakt `kWh`, `m3`, `einheiten`; Datumswerte ISO oder TT.MM.JJJJ,
Zahlen im deutschen Dezimalformat. Keine Umrechnung oder Zuordnung zu Nutzern.
Zusätzliche Spalten bleiben unverarbeitet in der Quelldatei. Die Funktion
speichert nichts im Datenmodell und sendet keine Daten an einen Dienst.

Grenzen: 5 MiB UTF-8, 1.000 Datenzeilen, 64 Spalten und 10.000 Zeichen pro
Zelle. Leere/mehrdeutige Überschriften, unterschiedliche Spaltenzahlen,
ungültige Datumswerte, fehlende Nummern, negative oder nicht endliche Stände
und unbekannte Einheiten werden ausdrücklich zurückgewiesen. Fehler enthalten
keine Originalwerte.
