# Beispieldaten

Alle Dateien in diesem Ordner sind frei erfunden. Sie enthalten keine echten
Personen, Anschriften oder Kontoverbindungen.

## Beispielobjekt (`beispielobjekt.json`)

Ein vollständiges Abrechnungsjahr 2025 zum Ausprobieren: Datei über
**Daten importieren** (Kopfleiste) laden, die Vorschau bestätigen und danach
unter **Berechnung** auf „Abrechnung berechnen“ klicken.

| Merkmal           | Inhalt                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Häuser            | Haus Nord (Altbau, Heizöl, Heizkostenverteiler), Haus Süd (Neubau, Wärmepumpe, Wärmemengenzähler), beide mit zentralem Warmwasser      |
| Wohnungen         | 12, davon eine ganzjährig und eine ab Oktober leer                                                                                     |
| Nutzerwechsel     | Haus Nord, Whg. 3 zum 1. Juli und Haus Süd, Whg. 6 zum 1. Oktober (danach Leerstand), jeweils mit Zwischenablesung und neuer Anschrift |
| Eigentümerwechsel | Übergabe am 1. April; Öllieferung im Februar vom Voreigentümer, Vorjahreswerte aus dessen Abrechnung                                   |
| Betriebskosten    | 9 Kostenarten nach § 2 BetrKV mit Rechnung und Belegnummer, Lohnanteile nach § 35a EStG                                                |
| Heizkosten        | Öl nach FIFO mit Anfangsbestand, Wärmepumpenstrom, Wartung, Schornsteinfeger, Messdienst                                               |
| Warmwasser        | Wärmemenge nach Wärmezähler (§ 9 Abs. 2 HeizKV), Verteilung 70 % nach m³ (§ 8 HeizKV)                                                  |
| Wasser            | Wohnungswasserzähler (Kalt- und Warmwasser), Wasser und Abwasser nach Verbrauch in m³ (§ 556a Abs. 1 Satz 2 BGB)                       |
| § 6a HeizKV       | Heizspiegel 2026 (echte Klassengrenzen), DWD-Klimafaktor (Beispielwert), Steuern und Abgaben                                           |
| Bankverbindung    | fiktive IBAN mit nicht vergebener Bankleitzahl 00000000 und Kontoinhaber → GiroCode                                                    |
| Namen, Anschrift  | erfunden („Erika Mustermann“, „Am Musterhof 1“, PLZ 12345)                                                                             |

Ergebnis ohne eigene Eingaben: [Screenshots und Musterabrechnungen
(PDF)](../medien/README.md). Die Prüfung meldet **keinen Fehler, keine
Warnung und keinen Hinweis**; Kontrolldifferenz 0,00 €, acht Nachzahlungen
und vier Guthaben.

Für eine eigene Abrechnung ersetzen Sie mindestens die Bankverbindung
(**Objekte** bzw. **Firmen**) und den Klimafaktor des Deutschen
Wetterdienstes für Ihre Postleitzahl ([Datenquellen](../DATENQUELLEN.md)).

Die Datei wird aus `tests/integration/beispielobjekt.test.ts` erzeugt
(`BEISPIEL_AKTUALISIEREN=1 pnpm test:integration`); der Test stellt sicher,
dass sie dem aktuellen Schema entspricht und ohne Rechenfehler bleibt.

## Bankbuchungen (`bankbuchungen-beispiel.csv`)

Beispiel für den Kontoauszugs-Import, siehe
[`docs/BANK-CSV-FORMAT.md`](../BANK-CSV-FORMAT.md).
