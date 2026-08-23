# PR 18 – Tabellenorientierter Abrechnungsarbeitsplatz

## Zusammenfassung

Dieser PR baut die häufigsten Jahresabrechnungsarbeiten von Kartenlisten zu
kompakten, tastaturbedienbaren Tabellen um. Kostenarten, Kostenpositionen,
Bankbuchungen und Nutzerzeiträume lassen sich schneller überblicken, filtern
und gezielt bearbeiten.

## Änderungen

- gemeinsame Tabellen-Werkzeugleiste mit Suche, Filter, Trefferzahl und
  optionaler gefilterter Summe,
- Tabellenansichten für Kostenarten, Kostenpositionen, Bankbuchungen und
  Nutzerzeiträume,
- Enter öffnet die Zeilenbearbeitung, Escape schließt sie ohne Datenänderung,
- bestehende Detailformulare, centgenaue Buchungssplits und geschützte
  Löschabläufe bleiben erhalten,
- Nutzerzeilen zeigen vorhandene Validator-Fehler und -Warnungen direkt an,
- gemeinsame Arbeitsstatusleiste zeigt Kostenpositionen, offene Buchungen sowie
  Fehler- und Warnungszahlen und verlinkt zur Freigabeprüfung,
- Tabellenköpfe und Summenzeilen bleiben beim Scrollen sichtbar; auf kleinen
  Ansichten scrollen breite Tabellen innerhalb ihres eigenen Bereichs,
- zwei geprüfte, harmlose Bundle-Fundstellen aus React und pdfmake sind exakt
  per Dateiname und SHA-256 für den Deployment-Scanner freigegeben.

## Fachliche Grenzen

- keine Änderung an Schema v4, Migration, Core-Berechnung, Rundung,
  Freigabevertrag oder PDF-Snapshots,
- keine neuen Sammeländerungen oder externen UI-Abhängigkeiten,
- keine produktiven Daten oder Netzwerkfunktionen,
- `legacy/index.html` bleibt bytegenau unverändert.

## Verifikation

- vollständige Testsuite: grün,
- Lint und Typecheck: grün,
- Produktions-Build: grün,
- Deployment-Artefaktprüfung: grün,
- Repository-Guardrails und Privacy-Scan: grün,
- Abhängigkeits-Audit: keine bekannten Sicherheitslücken,
- Legacy-SHA-256 unverändert:
  `30995a442892f66bb8dcdaa55cb684c17ee59836e5b9a3ef16fc271f83f42095`,
- visueller Praxislauf mit rein fiktiven Daten auf Desktop und 390 × 844 px:
  Buchung anlegen, per Tastatur öffnen, Kostenart zuordnen, Umlagefähigkeit
  setzen, prüfen sowie Nutzerstatus kontrollieren.

## Review-Fokus

1. Tabellenfilter und Summen verändern keine gespeicherten Daten.
2. Zeilenbearbeitung verwendet weiterhin ausschließlich die vorhandenen
   immutable Commands.
3. Statusanzeigen stammen aus den bestehenden Validatoren und bilden keine
   zweite Freigabelogik.
4. Die beiden neuen Deployment-Hashes erlauben ausschließlich die geprüften
   React-/pdfmake-Falschmeldungen.

## Rollback

Der PR verändert keine persistierten Verträge. Ein vollständiger Rollback ist
ohne Migration oder Datenkonvertierung möglich.
