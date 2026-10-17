# Erste Abrechnung in 60 Minuten

Kurzanleitung für private Vermieter. Alle Daten bleiben im eigenen Browser;
es gibt kein Konto und keinen Server. Diese Anleitung ersetzt keine
Rechtsberatung.

## 0. Ausprobieren mit dem Beispielobjekt (10 Minuten)

1. App im Desktop-Browser öffnen.
2. In der Kopfleiste **Daten importieren** wählen und
   [`docs/beispiel/beispielobjekt.json`](beispiel/beispielobjekt.json) laden;
   die Vorschau bestätigen.
3. Unter **Berechnung** auf „Abrechnung berechnen“ klicken. Die
   Einzelabrechnungen, die **Energiebilanz je Heizkreis** und die
   Prüfhinweise erscheinen.
4. Unter **Freigabe** die Liste der Hinweise durchgehen. Jeder Hinweis führt
   mit einem Link zur Stelle, an der er behoben wird.

Danach unter **Sicherung** eine Sicherung herunterladen und mit eigenen Daten
neu beginnen.

## 1. Eigene Abrechnung Schritt für Schritt

Der Ablauf **Jahresabrechnung** führt durch acht Schritte:

| Schritt                      | Was Sie brauchen                                                        |
| ---------------------------- | ----------------------------------------------------------------------- |
| Objekt und Zeitraum          | Anschrift, Wohnungen mit Wohn- und beheizter Fläche, Abrechnungsjahr    |
| Belegung und Vorauszahlungen | Mieter je Wohnung mit Ein- und Auszug, Personen, Vorauszahlungen        |
| Heizung und Warmwasser       | Art der Heizung, Verteilung (z. B. 70/30), zentrales Warmwasser ja/nein |
| Zähler und Verbrauch         | Ablesewerte je Wohnung (Wärmezähler oder Heizkostenverteiler)           |
| Energie und Bestand          | Brennstoffrechnungen mit Menge, Anfangs- und Endbestand (Öl, Pellets)   |
| Kosten und Belege            | Rechnungen der Betriebskosten (Grundsteuer, Wasser, Müll, Strom …)      |
| Berechnung und Vorschau      | –                                                                       |
| Prüfung und Abschluss        | Versanddatum                                                            |

Tipps:

- **Mengen immer mit erfassen** (Liter, kg, kWh), nicht nur Beträge. Ohne
  Menge kann die App Warmwasseranteil, Energiebilanz und Bestand nicht prüfen.
- **Zählerstände mit Datum** eingeben. Die App prüft die Reihe über mehrere
  Jahre auf Ablesefehler.
- Unter **Freigabe** zeigen die Liste „Neue Angaben ergänzen“ und der Bericht
  **Veränderung zum Vorjahr** (mit CSV-Export), was noch fehlt bzw. auffällt.

## 2. Versand und Frist

- Die Abrechnung muss dem Mieter spätestens **zwölf Monate nach Ende des
  Abrechnungszeitraums** zugehen (§ 556 Abs. 3 BGB), für das Jahr 2025 also
  bis zum 31.12.2026. Danach sind Nachforderungen in der Regel
  ausgeschlossen.
- Das Versanddatum unter **Freigabe** eintragen; die PDFs entstehen unter
  **PDF und Export**.
- Mieter haben ab Zugang zwölf Monate Zeit für Einwendungen und dürfen die
  Belege einsehen. Den Hinweis darauf enthält jede Einzelabrechnung.

## 3. Objekt im Jahr gekauft

Wer ein Objekt im laufenden Jahr erwirbt, rechnet als Erwerber das **ganze
Jahr** ab. Die Kosten bis zum Übergabetag kommen meist aus der
Erwerberabrechnung des Verkäufers. Das Beispielobjekt zeigt einen solchen
Fall (Übergabe am 1. April).

- Der Übergabetag gehört zum Abrechnungsjahr; die Mieterabrechnung erhält
  dann einen neutralen Hinweis ohne Angaben zum Verkäufer. Die Eingabe in der
  Oberfläche folgt mit einem eigenen Assistenten; bis dahin lässt sich der
  Wert über eine Datei mit dem Feld `ownershipChange` setzen.
- Für jede übernommene Position festhalten, ob ein **Rechnungsbetrag**,
  **gezahlte Abschläge** oder eine **Schätzung** zugrunde liegt. Abschläge und
  Schätzungen meldet die Prüfung, bis die Rechnung vorliegt.
- **Übernommene Bestände** (z. B. Heizöl im Tank) mit dem belegten
  Anschaffungspreis bewerten, nicht mit einem Schätzpreis. Die App warnt, wenn
  der Preis je Liter mehr als 20 % von der Folgelieferung oder dem Vorjahr
  abweicht.

## 4. Typische Fehler

| Fehler                               | Was hilft                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Abschläge statt Rechnung abgerechnet | Jahresrechnung des Versorgers anfordern; Abschläge sind keine Kosten.                                                     |
| Kabel-TV weiter umgelegt             | Seit 1. Juli 2024 nicht mehr als Betriebskosten umlegbar (Ende des Nebenkostenprivilegs).                                 |
| Ablesefehler                         | Komma vergessen, Spalten vertauscht, Zähler steht: Die Zählerprüfung nennt die wahrscheinliche Lesung.                    |
| Mehr als 25 % geschätzt              | Über 25 % geschätzter Fläche wird nach § 9a Abs. 2 HeizKV nur nach Fläche verteilt; die Verbrauchsseite zeigt den Anteil. |
| Energiebilanz unplausibel            | Nutzungsgrad außerhalb 60–95 % bzw. Jahresarbeitszahl außerhalb 2–5: Bestand, Lieferungen und Wärmezähler prüfen.         |
| Frist verpasst                       | Abrechnung früh beginnen; § 556 Abs. 3 BGB beachten.                                                                      |

## 5. Daten sichern

Die Daten liegen nur in diesem Browser. Regelmäßig unter **Sicherung** eine
JSON-Sicherung herunterladen und an einem sicheren Ort ablegen.
