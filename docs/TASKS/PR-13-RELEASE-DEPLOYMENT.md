# PR 13 – Release und Deployment-Vorbereitung

Verantwortlich: Codex.
Review: unabhängiges Codex-Code- und Security-Review.
Externe Freigaben: Mensch.

## Ziel

Der nach PR 12 fachlich abgenommene Stand erhält einen reproduzierbaren,
datenschutzgeprüften statischen Build und einen bewusst manuellen
GitHub-Pages-Workflow. Der PR veröffentlicht die App noch nicht.

## Umfang

- zentrale App-Version `1.0.0` für Import, Berechnung, Persistenz, Backup und
  Oberfläche,
- manueller Pages-Workflow nur für `main`,
- getrennte minimale Build- und Deployment-Rechte,
- gepinnte externe Actions,
- strikter Deployment-Artefakt-Guard,
- CSP ohne Datenverbindungen zu Fremdservern,
- Architektur-, Repository- und Browser-Tests,
- Deployment-, Rollback- und Release-Dokumentation,
- aktualisierter Projektstatus.

## Nicht enthalten

- Aktivierung von GitHub Pages,
- Änderung des Branch-Schutzes,
- Ausführung eines öffentlichen Deployments,
- Erstellung eines GitHub-Releases oder Tags,
- produktive Daten, Screenshots oder Abnahmeberichte.

## TDD-Nachweis

Die Workflow- und Artefaktverträge wurden zuerst als fehlschlagende Tests
angelegt. CSP, Main-Branch-Gate und zentrale Version wurden ebenfalls zuerst
durch rote Assertions spezifiziert. Danach folgte jeweils die minimale
Implementierung.

## Sicherheitsvertrag

- Kein automatisches Deployment bei Merge, Push oder Pull Request.
- Deployment ausschließlich nach manuellem Start auf `main`.
- Build nur mit `contents: read`.
- Deployment nur mit Leserechten für Inhalte sowie Schreibrechten für Pages
  und dessen OIDC-Identitätstoken.
- Keine persistierten GitHub-Credentials im Checkout.
- Kein Symlink oder nicht statischer Dateityp im Artefakt.
- Keine JSON-, PDF-, ZIP-, Backup-, Source-Map- oder versteckte Datei.
- Keine personenbezogenen Muster, Secrets oder lokalen Benutzerpfade.
- Keine Netzwerkverbindung der laufenden App zu Fremdservern.

## Abnahme

- alle bisherigen Tests bleiben grün,
- alle Coverage-Gates bleiben mindestens 80 Prozent,
- vollständige E2E-Reihe einschließlich PDF/ZIP bleibt grün,
- Artefaktprüfung läuft nach dem echten Build,
- geprüftes Deployment wird vor dem Upload in ein festes Archiv überführt und
  das unveränderliche Upload-Artefakt wird auf einem frischen Runner nochmals
  bytegenau geprüft,
- Privacy- und Security-Scan sind grün,
- unabhängige Reviews ohne Blocker,
- Legacy-SHA-256 unverändert,
- keine Datei aus `private-data/` getrackt.
