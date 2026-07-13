# Projektauftrag

Ziel ist die kontrollierte Migration der bestehenden Single-File-App in eine lokal und datenschutzgerecht nutzbare TypeScript-Webanwendung. Funktionsfähiges Legacy-Verhalten darf nicht stillschweigend verloren gehen.

## Invarianten

- Legacy-Referenz bleibt bytegleich und lauffähig.
- Migration kommt vor Produkterweiterung.
- Fachlogik bleibt unabhängig von React, DOM und Persistenz.
- Geldbeträge werden intern in Cent gespeichert.
- Produktive Daten werden weder in GitHub noch in Test-Fixtures übernommen.
- Änderungen gelangen nur über geprüfte Pull Requests nach `main`.
