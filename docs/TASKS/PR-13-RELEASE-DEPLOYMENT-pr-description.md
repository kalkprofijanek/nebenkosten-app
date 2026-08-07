## Ziel

PR 13 bereitet Version 1.0.0 für ein kontrolliertes öffentliches Deployment
vor, ohne durch den Merge bereits GitHub Pages zu veröffentlichen.

## Änderungen

- einheitliche App-Version für Import, Berechnungssnapshot, gespeicherte
  Arbeitsbestände, Backups und Oberfläche,
- manueller GitHub-Pages-Workflow ausschließlich für `main`,
- gepinnte Actions und getrennte minimale Berechtigungen,
- statischer Artefakt-Guard gegen Daten, Secrets, lokale Pfade, Links und
  überbreite Verzeichnisbäume,
  unzulässige Dateitypen und Größenüberschreitungen,
- Upload eines festen Archivs und Byte-Prüfung desselben unveränderlichen
  GitHub-Artefakts auf einem separaten Runner vor dem Deployment,
- Content Security Policy mit `connect-src 'none'`,
- Architektur-, Repository- und Browser-Verträge,
- Deployment-, Release- und Rollback-Dokumentation,
- aktualisierter README-/Migrationsstatus.

## Bewusst nicht ausgeführt

- kein Pages-Go-live,
- keine Branch-Schutzänderung,
- kein Release-Tag,
- keine produktiven Daten oder öffentlichen Abnahmeberichte.

## Testplan

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm verify:deployment-artifact`
- `pnpm test:e2e`
- `pnpm privacy:scan`
- `pnpm security:audit`

## Review-Schwerpunkte

- ist ein automatisches oder Nicht-main-Deployment ausgeschlossen,
- sind Workflow-Rechte und Action-Pins minimal und unveränderlich,
- blockiert der Artefakt-Guard sensible oder nicht statische Inhalte,
- bleiben PDF-/ZIP-Dynamik und Hash-Navigation unter CSP funktionsfähig,
- stimmt Version 1.0.0 über alle produktiven Metadaten überein.
