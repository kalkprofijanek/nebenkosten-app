# Klimafaktoren und Messdienstentgelte

## Klimafaktoren des DWD

Der Deutsche Wetterdienst veröffentlicht die CSV-Listen unter
[Klimafaktoren im DWD-Open-Data-Angebot](https://opendata.dwd.de/climate_environment/CDC/derived_germany/techn/monthly/climate_correction_factor/recent/).
Wählen Sie die Datei für den gesamten Abrechnungszeitraum. Der Name enthält
Beginn und Ende als JJJJMMTT. Die App unterstützt CSV mit den Kopfzeilen
`DatAnf;DatEnd;PLZ;KF` und `DatAnf;DatEnd;PLZ;KF_k`, keine XML-Dateien.
Die Quellenangabe „Deutscher Wetterdienst“ wird übernommen (GeoNutzV).

Öffnen Sie „Abrechnungsjahre“, bearbeiten Sie das Jahr und aktivieren Sie
die Erfassung eines Klimafaktors. Prüfen Sie die vorgeschlagene Postleitzahl
des Objekts. Der CSV-Import übernimmt den Faktor dieser Postleitzahl, den
Zeitraum und die Quelle in die Eingabefelder. Erst das Speichern übernimmt
die Werte in den Bestand. Alternativ lässt sich ein Faktor von Hand mit
Zeitraum, Postleitzahl und Quelle erfassen. Es gibt keinen voreingestellten
Zahlenwert.

Vierstellige Postleitzahlen aus der DWD-Datei erhalten eine führende Null.
Mehrere Zeiträume in einer Datei, doppelte Postleitzahlen, ungültige Daten
oder nicht positive Faktoren werden abgewiesen. Die Grenze beträgt 5 MB
und 10000 Datenzeilen; damit passt eine landesweite Liste. Kostenimporte
behalten ihre eigene Grenze von 1000 Datenzeilen.

Der PDF-Vergleich wird nur bereinigt, wenn beide Faktoren vorhanden sind
und die im Bestand gespeicherten Faktoren zu Zeitraum und Objekt passen.
Liegt das Vorjahr im System vor, pflegen Sie seinen Faktor dort. Ohne
Vorjahresbestand erfassen Sie den Faktor zusammen mit dem gespeicherten
Vorjahresverbrauch unter „Verbrauch“. Die bestehende Auswahlregel für
gespeicherte Vorjahreswerte gilt weiterhin.

Die Balken zeigen die Heizverbrauchswerte multipliziert mit dem jeweiligen
Klimafaktor. Der Hinweis nennt Postleitzahl und beide Faktoren. Warmwasser
ist in diesem Vergleich nicht enthalten. Fehlen passende Faktoren, bleibt
der Vergleich unbereinigt und wird entsprechend bezeichnet. Die App setzt
keinen fehlenden Faktor stillschweigend auf 1.

## Messdienstentgelte

Bei einer Heizungs-Kostenart lässt sich „Messdienstentgelt (§ 6a HeizKV)“ auf automatisch, ja oder nein setzen. Ja und
nein haben Vorrang vor der bisherigen Erkennung anhand der Bezeichnung.
Automatisch verwendet diese Erkennung als Rückfall für bestehende Daten.
Die Kennzeichnung wird beim Übernehmen der Kostenarten ins Folgejahr
mitgeführt. Die Kostenübersicht zeigt die erkannten Entgelte; das PDF
verwendet die zentrale Erkennung aus dem Core.

Diese Funktionen ergänzen die vorhandenen Angaben. Sie schließen die
weiteren offenen Aufgaben zu Warmwasserenergie, Fernwärme, Steuern und
Abgaben sowie monatlichen Verbrauchsinformationen nicht ab.
