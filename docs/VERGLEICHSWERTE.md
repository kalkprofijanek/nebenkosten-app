# Vergleichswerte für Heizverbrauch

Unter „Heizkreise“ lässt sich bei einem bestehenden Heizkreis die Erfassung
von Vergleichswerten aktivieren. Die Werte sind optional; ohne passende
Referenz bleibt der Vergleich im PDF aus.

Wählen Sie im Heizspiegel oder einer anderen geeigneten Vergleichsquelle
die Kategorie für Energieträger, Gebäudegröße und gegebenenfalls
Baualtersklasse des Gebäudes. Die App bestätigt diese fachliche Auswahl
nicht. Übernehmen Sie die drei Klassengrenzen in kWh je m² und Jahr aus
dieser Kategorie; verwenden Sie keine geschätzten Grenzwerte.

Erfassen Sie Quelle, Fundstelle als HTTP-/HTTPS-Adresse, Bezugsjahr und
eine verständliche Beschreibung der Nutzerkategorie. Prüfen Sie außerdem,
ob die Vergleichswerte Warmwasser enthalten. Die Grenzen müssen positiv
sein und in der Reihenfolge „niedrig bis“, „mittel bis“, „erhöht bis“ steigen.
Die App prüft das Datenformat, die Berechnung und die verfügbare Energie,
ersetzt aber nicht die Auswahl einer geeigneten Referenz.

Bei berechenbarem Vergleich enthält die Einzelabrechnung den eigenen
Verbrauch in kWh je m² und Jahr, die Klasse, die Quelle und die Grenzen.
Die Grenzen werden zusätzlich auf die eigene Fläche und Nutzungsdauer
umgerechnet. Teilzeiträume werden als auf ein Jahr hochgerechnet kenntlich
gemacht. Die Energieanteile stammen aus der vorhandenen Berechnung des
Heizkreises. Dessen Mittelwert steht weiterhin zusätzlich im PDF.

Fehlt eine notwendige Rechengröße, erscheint keine Vergleichszeile. Ein
vorhandener Datensatz allein gewährleistet deshalb keine vollständigen
Angaben nach § 6a HeizKV. Der pauschale Prüfhinweis
`heating.consumption_benchmark_missing` wird noch von Claude angepasst;
dieser Folge-PR ändert keine Validatoren. Witterungsbereinigung und die
weiteren offenen Angaben sind getrennte Aufgaben.
