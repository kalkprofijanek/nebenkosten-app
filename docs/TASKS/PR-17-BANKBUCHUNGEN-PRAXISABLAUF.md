# PR 17 – Bankbuchungen und belastbarer Praxisablauf

Verantwortlich: Codex. Finale Freigabe: Mensch.

## Ziel

Der vollständige Jahresabrechnungsablauf wird mit rein fiktiven Daten wie von
einer Immobilienkauffrau oder einem Immobilienkaufmann durchgespielt. Dabei
festgestellte Lücken werden testgetrieben geschlossen, ohne Rechenregeln,
Schema-Version oder PDF-Snapshot-Vertrag zu verändern.

## Umfang

- Bankbuchungen lokal aus CSV importieren oder einzeln erfassen,
- CSV-Grenzen, Zeichencodierungen, Datums- und Betragsformate streng prüfen,
- Duplikate deterministisch und mit einem 64-Bit-Fingerabdruck erkennen,
- große Importe linear verarbeiten,
- optionale Formularwerte JSON-sicher speichern,
- nach Fachänderungen eine aktuelle Berechnung vor der PDF-Freigabe verlangen,
- Nutzerwechsel im PDF-Arbeitsbereich eindeutig mit Einheit und Person zeigen,
- Kostenpositionsformulare nach dem Speichern vollständig zurücksetzen.
- gespeicherte Buchungssplits bei der Wiederbearbeitung vollständig vorbelegen,
- optionale Brennstoff- und Zählerfelder ohne `undefined` persistieren,
- den Sprunglink auf den Hauptinhalt tastaturwirksam fokussieren.

## Acht geprüfte Praxisbereiche

1. Zwei Objekte und mehrere Abrechnungsjahre bleiben beim Kontextwechsel
   getrennt.
2. CSV-Dubletten, centgenaue Aufteilungen, Prüfsperre und Wiederöffnung von
   Bankbuchungen funktionieren.
3. Nutzerwechsel, Leerstand, Überschneidungsfehler und Korrekturen sind über
   die Oberfläche abgedeckt.
4. Heizkreis, Brennstoffbestand, Lieferung, Zähler, Ablesungen und Jahresstatus
   bleiben nach einem Browser-Neustart erhalten.
5. Eine PDF-bereite Abrechnung kann begründet geöffnet, geändert, neu berechnet,
   erneut dokumentiert und finalisiert werden.
6. Einzel- und Gesamtabrechnung wurden als echte A4-PDFs textlich und visuell
   geprüft.
7. Import, automatisches Speichern, JSON-Sicherung, manueller Snapshot und
   Wiederherstellung überstehen einen Neustart.
8. Mobile Navigation, horizontale Breite, Tastaturführung und verständliche
   Formularfehler sind im unterstützten Chromium-Browser geprüft.

## Erweiterte UI-Prüfung

9. Alle Arbeitsbereiche, leere Zustände und unbekannte Direktlinks bleiben
   erreichbar und führen kontrolliert zur Übersicht zurück.
10. Firmen- und Objektdaten bleiben nach Bearbeitung und Neuladen erhalten;
    der Löschschutz erklärt verknüpfte Datensätze verständlich.
11. Eine neue, direkt erreichbare Datenübersicht zeigt Kostenarten,
    Kostenpositionen und Bankbuchungen. Listen mit mehr als 50 Einträgen sind
    seitenweise bedienbar.
12. Ungültige Pflichtfelder, negative Flächen und beschädigte CSV-Dateien
    erhalten die bereits eingegebenen, gültigen Werte zur Korrektur.
13. Ein schneller Doppelklick erzeugt weder einen doppelten Datensatz noch
    eine irreführende Fehlermeldung.
14. Korrekturverweise aus der Freigabe führen bis zum passenden Stammdatenfeld.
15. Ein abgebrochener Import ersetzt keine Daten; beschädigte JSON-Dateien
    werden mit einem stabilen Fehlercode zurückgewiesen.
16. Import- und Wiederherstellungsdialoge starten mit einem sicheren
    Abbruchfokus; Desktop- und Mobilansicht wurden zusätzlich visuell geprüft.

## Sicherheits- und Datenschutzgrenzen

- CSV-Dateien werden ausschließlich im Browser verarbeitet und nicht
  übertragen.
- Maximal 5 MB, 20.000 Buchungszeilen und 10.000 Zeichen je Zelle.
- Keine produktiven Daten, Zugangsdaten oder Kontoauszüge in Git, Tests,
  Screenshots oder Dokumentation.
- Sämtliche Testdaten sind synthetisch und als fiktiv erkennbar.
- Status-, Audit-, Dokument- und Berechnungsverträge bleiben verbindlich.

## Abnahme

- Unit- und Komponententests decken Parser, Duplikatschutz, JSON-Persistenz,
  Formularzustand und Berechnungs-Gate ab.
- Ein Browser-End-to-End-Test importiert, klassifiziert, prüft und verknüpft
  eine fiktive Bankbuchung.
- Der manuelle Browserlauf umfasst Nutzerwechsel, Kostenerfassung,
  Berechnung, Freigabe, PDF-Einzel- und Gesamtdokumente sowie ZIP-Export.
- Format, Lint, Typprüfung, vollständige Tests, Coverage, Build,
  Deployment-Artefakt, Privacy-Scanner, Repository-Guardrails und
  Sicherheitsprüfung sind grün.
