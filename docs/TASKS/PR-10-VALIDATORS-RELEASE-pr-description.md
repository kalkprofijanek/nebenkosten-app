# PR 10 – Validatoren und Freigabe

## Ziel

Die neue lokale Anwendung erhält den vollständigen Prüf- und
Freigabeprozess aus Masterplan 7. Fehler blockieren, Warnungen verlangen eine
instanzgenaue bewusste Bestätigung und Hinweise bleiben informativ.

## Inhalt

- zentrale formelle und fachliche Prüfungen in `packages/validators`
- deterministischer Prüfbericht mit stabilen Codes, Pfaden und Entitäten
- kontrollierter, auditierter Freigabestatus
- Sperrlogik für freigegebene und finalisierte Abrechnungsstände
- zugängliche Freigabeoberfläche mit gruppierten Befunden
- bewusste Bestätigung jeder aktuellen Warnung
- aktualisierte lokale Ein-Datei-HTML-Vorschau

## Schutzmaßnahmen

- keine Cloud, keine Telemetrie und keine externen Rechtswerttabellen
- ausschließlich fiktive Tests
- keine personenbezogenen Werte in Audit-Details oder Fehlermeldungen
- keine stillen Statuswechsel oder Überschreibungen
- `legacy/index.html` unverändert

## Nicht enthalten

- PDF und Export (PR 11)
- Produktionsmigration und Endabnahme (PR 12)
