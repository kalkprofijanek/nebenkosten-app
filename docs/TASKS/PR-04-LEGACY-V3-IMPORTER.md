# PR 04 – Legacy-v3-Importer

## Ziel

Legacy-Exporte mit Schema-Version 3 kontrolliert, nachvollziehbar und ohne
stille Datenverluste in das aktuelle Schema 4 überführen. Die produktive
Legacy-App bleibt unverändert und wird nicht überschrieben.

## Umfang

- sichere Importgrenze für Originalbytes, UTF-8 und JSON
- SHA-256 über unveränderte Quelldatei-Bytes
- Laufzeitvalidierung und Versionsschutz
- deterministische v3→v4-Transformation aller in PR 03 erfassten Entitäten
- Cent-Konvertierung, Enum-/Referenzmapping und historisches Root-Layout
- Erhalt unbekannter und ungültiger optionaler Werte in `legacyUnmapped`
- redigierter Migrationsbericht ohne rohe Personen-, Bank- oder Belegdaten
- Round-Trip-Grundtest und rein fiktive Fixture-Suite

## Verbindliche Entscheidungen

- Neue Entitäten erhalten deterministische UUIDv8-IDs aus Quellhash und
  Quellpfad.
- Objektlokale Block-IDs werden als `<propertyId>:<blockId>` namespaced.
- Ungültige Pflichtwerte führen zu `validation_failed`; es gibt keine
  fachlichen Standardwerte `0` für fehlende Daten.
- Unbekannte optionale Werte werden gemeldet und konserviert.
- Die Default-Blockdaten aus der Legacy-Datei werden nicht in neuen Code oder
  Fixtures kopiert.
- Anhänge werden nach Größe, Dateiname, MIME, Endung, Base64 und Signatur
  geprüft; abgewiesene Inhalte bleiben lokal konserviert.

## Akzeptanz

Sicherheitsgrenzen: höchstens 10 MiB Originalbytes, 1.000 Elemente je
Collection, 10.000 Knoten, 64 Ebenen und 10 MiB Text. Dynamische unbekannte
Schlüsselnamen erscheinen nur in `legacyUnmapped`, niemals im Bericht.
`__proto__` wird als reservierter Schlüssel redigiert abgewiesen und nie
gemergt.

- eine frei erfundene vollständige v3-Datei wird in gültiges Schema 4 migriert
- Volljahr, Nutzerwechsel-/Leerstandsstruktur, mehrere Blocks, Einzelblock,
  historisches Root-Layout, Zählerstatus, Buchungssplits und unbekannte Felder
  sind getestet
- gleiche Eingabe und Zeitquelle erzeugen identisches Ergebnis
- Eingabeobjekt und `legacy/index.html` bleiben unverändert
- neuere Versionen werden blockiert, ältere und strukturell ungültige Dateien
  verständlich zurückgewiesen
- Bericht enthält Pfade und Codes, aber keine rohen Legacy-Werte
- Unit-, Integrations-, Migrations-, Datenschutz- und Security-Prüfungen sind
  grün; Coverage liegt in allen Kategorien über 80 Prozent

## Nicht Teil dieses PR

- UI-Vorschau und bewusste Übernahme (PR 08)
- Persistenz-Snapshot und Rollback (PR 09)
- vollständige fachliche Plausibilitätsvalidatoren (PR 10)
- Berechnungs- und PDF-Logik (PR 05–07)
