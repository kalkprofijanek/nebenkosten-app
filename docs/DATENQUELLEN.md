# Datenquellen für Referenzwerte

Die App rechnet ohne Netzverbindung (Content Security Policy
`connect-src 'none'`) und liefert keine Referenzdaten Dritter mit. Werte wie
Klimafaktoren oder Heizspiegel-Vergleichswerte holen Sie bzw. der KI-Agent
selbst aus der Originalquelle; die Oberfläche verlinkt die Quellen an der
jeweiligen Eingabestelle.

**Arbeiten mit KI:** Der Agent ruft die Werte selbst aus den unten genannten
Quellen ab, nennt für jeden Wert die genaue Fundstelle (URL bzw. Dateiname)
und das Abrufdatum und legt sie zur Bestätigung vor. Er schätzt oder erfindet
keine Referenzwerte (siehe [KI-Anleitung](KI-ANLEITUNG.md)).

| Wert                                 | Quelle                                                                                                                                                                                                                                          | Hinweise                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Klimafaktor je Postleitzahl          | [DWD Open Data – Klimafaktoren](https://opendata.dwd.de/climate_environment/CDC/derived_germany/techn/monthly/climate_correction_factor/recent/)                                                                                                | Für das Kalenderjahr die Datei `KF_JJJJ0101_JJJJ1231.csv` (bzw. `…_k.csv`) laden und unter **Abrechnungsjahre → Klimafaktor (DWD)** einlesen. Quellenvermerk „Deutscher Wetterdienst“. |
| Vergleichswerte Durchschnittsnutzer  | [Heizspiegel für Deutschland (co2online)](https://www.heizspiegel.de/)                                                                                                                                                                          | Tabelle passend zu Energieträger und Gebäudefläche, Abrechnungsjahr angeben. Kommerzielle Nutzung der Daten nur mit Genehmigung von co2online; daher nicht mitgeliefert.               |
| Gradtagszahlen (§ 9b HeizKV)         | in der App enthalten (Promilletabelle nach VDI 2067)                                                                                                                                                                                            | Keine externe Quelle nötig.                                                                                                                                                            |
| CO₂-Preis nach BEHG                  | [Deutsche Emissionshandelsstelle (DEHSt)](https://www.dehst.de/)                                                                                                                                                                                | Preis des Lieferjahres; maßgeblich ist der auf der Brennstoffrechnung ausgewiesene Betrag.                                                                                             |
| Emissionsfaktor, CO₂-Kosten, Steuern | Brennstoff- bzw. Energierechnung des Lieferanten                                                                                                                                                                                                | Lieferanten müssen Emissionen und CO₂-Kosten ausweisen (CO2KostAufG).                                                                                                                  |
| Rechtsgrundlagen                     | [HeizKV](https://www.gesetze-im-internet.de/heizkostenv/), [BetrKV](https://www.gesetze-im-internet.de/betrkv/), [CO2KostAufG](https://www.gesetze-im-internet.de/co2kostaufg/), [§ 556 BGB](https://www.gesetze-im-internet.de/bgb/__556.html) | Amtliche Fassung bei gesetze-im-internet.de.                                                                                                                                           |

Hinweis: Diese Übersicht ersetzt keine Rechtsberatung. Prüfen Sie bei jeder
Abrechnung, ob die Quelle noch aktuell ist.
