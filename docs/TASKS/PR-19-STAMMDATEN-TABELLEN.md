# PR 19 – Stammdaten und Abrechnungsjahre als Arbeitstabellen

## Nutzerziel

Als Immobilienkaufmann möchte ich Firmen, Objekte, Gebäude, Einheiten und
Abrechnungsjahre in kompakten Tabellen überblicken, durchsuchen, auswählen und
gezielt bearbeiten, damit ich auch bei größeren Beständen nicht durch lange
Formularlisten scrollen muss.

## Umfang

- Firmenübersicht mit Suche, Ergebniszahl und direkter Zeilenauswahl
- Objektübersicht mit Suche, Gebäude-/Einheitenzahl und Flächensumme
- kompakte Gebäude- und Einheitentabellen; je Bereich ist höchstens ein
  Detailformular geöffnet
- Abrechnungsjahre mit Suche, Statusfilter und direkter Zeilenauswahl
- vorhandene Anlage-, Speicher-, Lösch- und Validierungsbefehle bleiben
  unverändert
- Tastaturbedienung und responsive horizontale Tabellenansicht

## Bewusste Grenzen

- keine Schema-, Migrations- oder Rechenänderung
- keine Sammelbearbeitung mehrerer Datensätze
- Heizung und Zähler werden in einem getrennten Folge-PR betrachtet
- Auswahlfelder bleiben als Schnellauswahl erhalten; Tabellen ergänzen den
  vollständigen Arbeitsüberblick

## Abnahmekriterien

1. Jede Übersicht ist ohne Öffnen aller Detailformulare erfassbar.
2. Suche und Statusfilter aktualisieren Trefferzahl und Leerzustand sofort.
3. Eine Tabellenzeile kann den aktiven Kontext sicher wechseln.
4. Gebäude- und Einheitenformulare sind standardmäßig geschlossen und öffnen
   sich nur für den gewählten Datensatz.
5. Bestehende Schreib- und Löschregeln bleiben vollständig getestet.
6. Unit-/Integration-/E2E-Tests, Coverage-Gates, Datenschutzscanner,
   Deployment-Prüfung und Legacy-Hash bleiben grün.
