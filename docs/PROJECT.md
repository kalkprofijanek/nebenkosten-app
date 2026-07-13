# Projektauftrag

Ziel ist die kontrollierte Migration der bestehenden Single-File-App in eine lokal und datenschutzgerecht nutzbare TypeScript-Webanwendung. Funktionsfähiges Legacy-Verhalten darf nicht stillschweigend verloren gehen.

## Invarianten

- Die sanitisierte, noch nicht abschließend anonymitätsgeprüfte GitHub-Referenz bleibt ab dem bereinigten Root-Commit bytegleich und lauffähig.
- Die unveränderte lokale Sicherung ist bytegleich zur produktiv genutzten lokalen App, nicht zur GitHub-Baseline, und dient ausschließlich lokal als Vergleichssystem.
- Migration kommt vor Produkterweiterung.
- Fachlogik bleibt unabhängig von React, DOM und Persistenz.
- Geldbeträge werden intern in Cent gespeichert.
- Produktive Daten werden weder in GitHub noch in Test-Fixtures übernommen.
- Änderungen gelangen nur über geprüfte Pull Requests nach `main`.
