# Geführte Jahresabrechnung

Stand: 26. September 2026. Lokale Weiterentwicklung auf PR 20.

## Ziel und Umfang

Die Jahresabrechnung verbindet vorhandene Eingaben und Freigabeaktionen zu acht
Schritten: Objekt/Zeitraum, Belegung/Vorauszahlungen, Heizung/Warmwasser,
Zähler/Verbrauch, Energie/Bestand, Kosten/Belege, Berechnung/Vorschau und
Prüfung/Abschluss. Die bisherigen Arbeitsbereiche bleiben direkt erreichbar.
Schritt 1 prüft den ausgewählten Kontext und verlinkt zur Jahresverwaltung;
Neuanlage und Löschen werden nicht als Änderung des bisherigen Jahres behandelt.

Der Assistent zeigt vorhandene Prüfhinweise mit Bearbeitungslinks. Die Durchsicht
der Schritte gilt nur für die Sitzung, ist keine fachliche Freigabe und wird bei
geänderten Eingaben verworfen. Die bestehenden Statusübergänge und Sperren gelten
auch innerhalb des Assistenten. Kostenlose oder heizungsfreie Jahre benötigen
keine künstlichen Heizkreise: Schritte können zur späteren Prüfung übersprungen werden.

Die Vorschau zeigt gespeicherte Kostenanteile, Vorauszahlungen und Salden je
Wohnung/Nutzer. Leerstand wird als Vermieteranteil dargestellt. Inkompatible oder
vom neu berechneten Ergebnis abweichende Snapshots werden nicht als aktuelle
Einzelabrechnung angezeigt. Die Ausgabe ist keine Freigabe.

Die Energieübersicht nutzt dieselbe FIFO-Funktion wie die Rechenengine. Sie zeigt
Anfangsbestand, Liefermengen, Rest und Verbrauch sowie Restwert/Verbrauchskosten.
Fehlende Werte, gemischte Einheiten, negative Mengen und Überbestand werden
sichtbar gemeldet. Dies ergänzt die Anzeige; die verbindlichen Validatorregeln
werden dadurch nicht erweitert. Beim Quellenwechsel werden die zugehörigen
Bestandsformulare neu geladen, damit alte Eingabewerte nicht übernommen werden.

## Quellen und bewusste Grenzen

Inspiration ist der öffentlich dokumentierte Techem-Ablauf, keine Nachbildung
einer eingesehenen angemeldeten Portalsitzung:

- https://www.techem.com/de/de/digital-services/services-direct
- https://www.techem.com/de/de/immobilienservices/das-kundenportal
- https://www.techem.com/content/dam/techem-at/documents/kundenportal/Anleitung_Digitale_Kosten%C3%BCbermittlung_Techem_neu.pdf.coredownload.pdf

Das österreichische Handbuch dient nur als Bedienvorbild. Seine rechtlichen
Vorgaben werden nicht auf die deutsche Abrechnung übertragen.

Schema v4, Migration, Berechnungsregeln und Legacy bleiben unverändert.
Die einzige Core-Änderung ist der öffentliche Export der vorhandenen FIFO-Funktion.
Keine Techem-Anbindung, keine Funkdatenübernahme und keine Rechnungs-OCR.
Zählerstände bleiben dokumentierte Ablesungen; für die Berechnung gelten die
bereits vorhandenen Verbrauchseinheiten je Belegungszeitraum. Der Assistent
macht diesen Unterschied ausdrücklich sichtbar. Automatische Zuordnung,
Zwischenablesungsauswertung und Zählerwechsel benötigen einen eigenen
fachlichen Vertrag und gegebenenfalls eine Schema-Migration.

## Prüfung

- Komponenten-/Integrationstests für Schrittwechsel, Durchsicht-Rücksetzung,
  fehlende Jahresauswahl, eingebettete Formulare und gesperrte Jahre.
- Vorschautests für Salden, Leerstand, geänderte Eingaben und ungültige Snapshots.
- FIFO-Tests für Mengen/Werte, Quellen-/Jahresabgrenzung und Fehlerzustände.
- Regressionstest für Bestandsformular beim Wechsel der Energiequelle.
- Browser-Test mit fiktiven Daten bei 1440 und 390 Pixel Breite, inklusive
  Screenshots der Belegung, Vorschau und Freigabeprüfung.
- 359 Oberflächentests, 725 Pakettests, 18 Integrationstests, 10 Migrationstests
  und 258 Charakterisierungstests bestanden; Architektur-/Repository-/Datenschutztests
  ebenfalls bestanden.
- Oberflächenabdeckung: 89,65 % Statements, 81,14 % Zweige, 91,90 % Funktionen,
  90,99 % Zeilen. Alle Paket-Schwellen von mindestens 80 % eingehalten.
- Fünf Browserprüfungen bestanden: Assistent und Heizkostenablauf jeweils Desktop/Mobil
  sowie PDF-Erzeugung mit Korrektur und Finalisierung; Sicherungsdownload geprüft.
- Formatierung, Lint, TypeScript, Build, Deployment-Artefakt und Datenschutz-/Repository-Prüfung bestanden.

Die abschließende Abhängigkeitsprüfung fand Browserslist 4.28.6 im Babel-Werkzeugpfad.
Der Sicherheitsfloor `>=4.28.7 <5` aktualisiert diesen Pfad auf 4.29.1 einschließlich
seiner Browserdaten. Quellen: [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)
und [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g).
Vitest und die zugehörige Coverage-Erweiterung wurden gemeinsam von 4.1.10 auf
4.1.11 aktualisiert, um auch [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
im Testwerkzeug zu schließen.
Der erneute Audit mit `--audit-level low` meldet keine bekannten Schwachstellen.

Push, Pull Request, Merge und Deployment sind nicht Teil der lokalen Umsetzung.
