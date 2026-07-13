# Nebenkosten-App

Dieses Repository enthält die kontrollierte Migration einer bestehenden, lokalen Nebenkostenabrechnungs-App in eine modulare TypeScript-Webanwendung.

## Aktueller Stand

Die Migration befindet sich in PR 00: Repository-Grundschutz. Unter `legacy/index.html` liegt eine sanitisierte, noch nicht abschließend anonymitätsgeprüfte Migrationsreferenz. Die unveränderte lokale Sicherung des produktiven Originalstands verbleibt ausschließlich lokal und wird nicht in GitHub gespeichert; sie ist nicht bytegleich zur GitHub-Baseline. Es wurde noch keine Fachlogik migriert.

## Sicherheitsregel

Produktive Abrechnungs-, Mieter-, Bank-, Verbrauchs- und Belegdaten gehören ausschließlich in das lokal ignorierte Verzeichnis `private-data/` und niemals in GitHub.

## Lokale Prüfung

Voraussetzung ist Node.js 22 oder neuer.

```powershell
npm.cmd test
npm.cmd run check:repository
```

Der verbindliche Ablauf steht in `MASTERPLAN_MIGRATION_FABLE_CODEX.md`.
