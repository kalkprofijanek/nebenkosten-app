# PR 09 – UI-Grundstruktur

Bezug: Masterplan Abschnitt 20, PR 09.

## Ziel

Die bereits geprüften Schema-, Import-, Rechen- und Persistenzpakete zu einer
lokalen, geführten Bedienoberfläche verbinden. Der Legacy-Hauptablauf muss von
der Anlage eines Arbeitsbestands bis zum gespeicherten Berechnungsergebnis
durchführbar sein. Die formelle Freigabe bleibt bis PR 10 gesperrt.

## Enthaltener Ablauf

1. lokalen v4-Arbeitsbestand anlegen oder v4/Legacy-v3-Datei importieren,
2. Firma und Eigentümergesellschaft anlegen,
3. Objekt mit Gebäude und erster Einheit anlegen,
4. Abrechnungsjahr anlegen,
5. Nutzer, Nutzerwechsel und Leerstand mit Zeiträumen erfassen,
6. Kostenart und Kostenbuchung erfassen,
7. Heizsystem, Heizkreis und Energiequelle erfassen,
8. Core-Berechnung ausführen und Ergebnis-Snapshot lokal speichern,
9. gesperrten Freigabebereich mit dem letzten Kontrollergebnis anzeigen.

## Architekturgrenzen

- React-Komponenten enthalten keine fachliche Rechenlogik. Die Berechnung
  delegiert an `@nebenkosten/core`.
- Alle schreibenden Fachaktionen laufen über immutable Commands und validieren
  das vollständige Ergebnis erneut gegen das v4-Schema.
- Geld wird in der UI deutschsprachig eingelesen und ausschließlich als ganze
  Centwerte an die Commands übergeben.
- Auswahlkontext für Firma, Objekt und Abrechnungsjahr wird gegen den jeweils
  aktuellen Datenstand normalisiert. Gelöschte oder importbedingt ersetzte
  Referenzen werden nicht weiterverwendet.
- Ein Berechnungslauf ergänzt `CalculationRun` und `CalculationResult`; er
  verändert den Status des Abrechnungsjahres nicht.
- Freigabevalidatoren, Statusübergänge und Abschlussbestätigungen gehören
  ausschließlich zu PR 10.
- PDF und Export gehören zu PR 11.

## Lokale Speicherung und Konfliktschutz

- Die Browser-App lädt und speichert über den in PR 08 geprüften
  IndexedDB-Adapter.
- Änderungen werden verzögert automatisch gespeichert und verwenden
  Compare-and-Swap-Revisionen.
- Während ungesicherter Änderungen, eines laufenden Speichervorgangs oder
  eines Konflikts ist der Import gesperrt.
- Änderungen aus einem zweiten Tab werden nur als Revision angekündigt; es
  werden keine Anwendungsdaten über `BroadcastChannel` übertragen.
- Ein erkannter externer Stand wird niemals still überschrieben.
- Beim Verlassen warnt die Anwendung, solange ungesicherte Änderungen
  bestehen.

## Importvertrag

- Unterstützt werden aktuelle v4-Dateien und Legacy-v3-Dateien über den
  geprüften Importer aus PR 04.
- Die Dateigröße wird vor dem Einlesen auf 25 MiB begrenzt.
- Vor der Übernahme werden ausschließlich anonymisierte Anzahlen und
  Warnungszahlen angezeigt.
- Ein bestehender Arbeitsbestand erhält vor dem Import einen manuellen,
  angehefteten Snapshot.
- Lese-, Validierungs- und Speicherfehler werden mit sicheren Fehlercodes
  angezeigt; Pfade, Dateiinhalte und Browserfehler werden nicht ausgegeben.

## Vorschau

Der reproduzierbare Produktions-Build kann als einzelne, lokale HTML-Datei
verpackt werden. Im `file:`-Modus arbeitet die Oberfläche ausschließlich mit
einem flüchtigen Memory-Adapter. Ein leerer, fiktiver Arbeitsbestand wird
automatisch bereitgestellt, damit alle Masken ausprobiert werden können.
Hinweise in Kopf- und Datenschutzbereich machen klar, dass Änderungen beim
Neuladen verloren gehen.

## TDD- und Akzeptanzkriterien

- Unit- und Komponententests für Navigation, Formulare, Commands,
  Auswahlkontext, Import, Autosave, Konflikte und Berechnung.
- Headless-End-to-End-Test für den vollständigen Hauptablauf bis zum
  gespeicherten Berechnungsergebnis und der weiterhin gesperrten Freigabe.
- Web-Coverage in Statements, Branches, Functions und Lines mindestens 80 %.
- Lint, Typecheck, Formatprüfung, Build, Privacy-Scanner und
  Repository-Guardrails sind grün.
- Die Vorschau besitzt eine restriktive Content-Security-Policy und benötigt
  weder Netzwerkzugriff noch extern geladene Ressourcen.
- Ausschließlich fiktive Testdaten; keine produktiven oder personenbezogenen
  Daten im Repository.
- `legacy/index.html` bleibt bytegenau unverändert.
