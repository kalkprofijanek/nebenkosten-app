# PR 10 – Validatoren und Freigabe

Verantwortlich: Codex (Claude war für die Implementierung nicht verfügbar).
Review: unabhängige Codex-Code- und Sicherheitsprüfung; anschließend Claude,
sobald verfügbar.
Freigabe: Mensch.

## Ziel

Die bisher gesperrte Freigabeseite wird durch einen nachvollziehbaren lokalen
Prüfprozess ersetzt. Alle formellen und fachlichen Prüfungen leben zentral in
`packages/validators`; React zeigt ausschließlich den Bericht an und löst
kontrollierte Statusübergänge aus.

## Verbindliche Regeln

- `error` blockiert `READY_FOR_PDF`.
- Jede aktuelle `warning` muss einzeln und bewusst bestätigt werden.
- `info` hat keine Sperrwirkung.
- Eine Kontrolldifferenz von höchstens einem Cent ist zulässig; darüber liegt
  ein Fehler vor.
- Warnungsbestätigungen sind instanzgenau an Code, Entität und Pfad gebunden.
- Direkte Kosten bleiben gesperrt, solange das v4-Modell kein Zuordnungsziel
  für einzelne Nutzer enthält.
- Zeitabhängige Rechts- und CO₂-Preisregeln werden nicht ohne versionierten,
  fachlich freigegebenen Regelkatalog erfunden.

## Statusfolge

```text
DRAFT → IN_REVIEW → READY_FOR_PDF → FINALIZED → SUPERSEDED
```

- `DRAFT → IN_REVIEW` startet die Prüfung und protokolliert sie.
- `IN_REVIEW → READY_FOR_PDF` benötigt null Fehler und alle aktuellen
  Warnungsbestätigungen.
- `IN_REVIEW → DRAFT` und `READY_FOR_PDF → IN_REVIEW` sind kontrollierte,
  begründete Rückwege.
- Die dokumentbasierte Finalisierung bleibt in der Oberfläche bis PR 11
  gesperrt.
- `SUPERSEDED` ist terminal.
- Fachliche Änderungen während `IN_REVIEW` setzen den Zeitraum protokolliert
  auf `DRAFT` zurück. `READY_FOR_PDF`, `FINALIZED` und `SUPERSEDED` sind für
  fachliche Änderungen gesperrt.

## Mindestprüfungen

Umgesetzt werden sämtliche Gruppen aus Masterplan 7.2:

- Firmen-, Objekt- und Bankstammdaten,
- Abrechnungszeitraum und Belegungszeiträume,
- Flächen, Vorauszahlungen und Kostenbereiche,
- Kostenarten, Umlageschlüssel, Beträge und Vorjahressteigerungen,
- Beleg- und Buchungsverknüpfungen,
- Heizkreise, Energiequellen, Warmwasser und CO₂,
- Zählernummern und Jahreschecklisten,
- aktuelle Berechnung, Kontrolldifferenz, unverteilter Heizanteil und direkte
  Kosten,
- Schema-Version und strukturelle Eingabefehler.

## Datenschutz und Sicherheit

- ausschließlich lokale Verarbeitung, keine Netzwerkaufrufe oder Telemetrie,
- ausschließlich fiktive Testdaten,
- keine Rohdaten, Namen, IBANs oder Dateiinhalte in Audit-Details,
- untrusted Eingaben werden geprüft und nicht still überschrieben,
- Statusänderungen sind immutable und append-only protokolliert,
- `legacy/index.html` bleibt unverändert.

## Tests und Abnahme

- Validator-Paket mit eigenem Unit- und Coverage-Gate von mindestens 80 % in
  allen vier Messgrößen,
- tabellengetriebene Status- und Sperrtests,
- Komponenten- und Workspace-Integrationstests,
- kritischer Headless-E2E-Freigabefluss,
- vollständige Root-CI, Privacy-Scanner und Dependency-Audit.

## Nicht Teil dieses PR

- PDF-, ZIP- oder sonstige Dokumenterzeugung (PR 11),
- produktive Datenmigration und finale Vergleichsabnahme (PR 12),
- Cloud, Anmeldung, Rollen und Remote-Speicherung (Phase 2).
