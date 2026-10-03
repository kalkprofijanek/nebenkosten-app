# ADR-0002: Ausschließlich Desktop-Nutzung

- Status: angenommen
- Datum: 2026-10-03
- Entscheidung des Nutzers

## Kontext

Bisherige Arbeitspakete haben Oberflächen zusätzlich auf Mobilbreite (390 px)
geprüft und Mobilprobleme behoben. Die Nebenkostenabrechnung wird jedoch
ausschließlich am Arbeitsplatz-Rechner erstellt. Mobilprüfungen kosten Zeit,
erzeugen wiederkehrende Nacharbeit und blockieren Pull Requests, ohne der
tatsächlichen Nutzung zu dienen.

## Entscheidung

1. Die App wird nur für Desktop-Browser entwickelt und geprüft
   (Referenzbreite 1440 px).
2. Mobil- und Tablet-Darstellung sind kein Ziel. Es werden keine
   Mobilverbesserungen, keine Mobil-Browsertests und keine Abnahmekriterien
   für schmale Breiten ergänzt.
3. Vorhandenes responsives CSS bleibt unverändert, wird aber weder erweitert
   noch gezielt repariert. Es wird auch nicht aktiv entfernt.
4. Barrierefreiheit (Tastaturbedienung, Beschriftungen, Fokus) bleibt
   unabhängig davon verbindlich.

## Konsequenzen

- Mobilvarianten der Playwright-Tests werden entfernt; die Desktop-Prüfung
  einschließlich „kein horizontaler Überlauf“ bei 1440 px bleibt.
- Neue Aufgabenbeschreibungen und Agentenaufträge enthalten keine
  Mobilprüfung mehr.
- Eine spätere Mobilnutzung erfordert eine neue, ausdrückliche Entscheidung.
