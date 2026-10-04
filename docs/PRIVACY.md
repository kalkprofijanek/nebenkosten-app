# Datenschutz

Neue Inhalte auf GitHub sind auf Quellcode, Dokumentation und vollständig anonymisierte Testdaten beschränkt. Produktive Dateien werden lokal unter `private-data/` abgelegt; der gesamte Pfad ist ignoriert. Das Repository ist öffentlich. Die Freigabebedingungen aus ADR-0001 (Bereinigung der Historie durch GitHub Support und erneute Inhaltsprüfung) sind laut Maintainer erfüllt; siehe Nachtrag in `docs/DECISIONS/ADR-0001-SANITIZED-LEGACY-BASELINE.md`.

## Verbotene Repository-Inhalte

- Namen, Anschriften oder E-Mail-Adressen realer Mieter
- Bank- und Zahlungsdaten
- Rechnungen, Belege und nicht anonymisierte Abrechnungen
- Zählernummern, echte Verbrauchs- und Objektdokumente
- OneDrive-Dateien, Backups und lokale Exporte

Der ursprüngliche Legacy-Snapshot enthielt vorbestehende geschäftliche und operative Referenzangaben. Nach einem Datenschutzvorfall wurde `main` als neuer, sanitisierter Root-Commit aufgebaut. Diese Bereinigung ist noch nicht als vollständige Anonymisierung nachgewiesen. Der GitHub-Snapshot ist nicht bytegleich mit der produktiven Original-App und kann in bereinigten Seed- und Klassifizierungsbereichen abweichendes Verhalten zeigen. Der produktive Originalstand verbleibt ausschließlich lokal.

Geschlossene Pull-Request-Refs und alte Commit-Objekte können trotz History-Rewrite weiterhin erreichbar sein. Deshalb durfte das Repository nur öffentlich gestellt werden, wenn GitHub Support deren Dereferenzierung, Cached-View-Bereinigung und serverseitige Garbage Collection bestätigt hat **und** eine dokumentierte erneute Inhalts-/Denylist-Prüfung der gesamten erreichbaren Historie keine operativen oder personenbezogenen Identifikatoren findet. Details stehen in `docs/DECISIONS/ADR-0001-SANITIZED-LEGACY-BASELINE.md`.

## Nutzerdaten der veröffentlichten App

Die App unter GitHub Pages verarbeitet alle Eingaben ausschließlich lokal im Browser (IndexedDB); ausgehende Verbindungen sind per Content Security Policy gesperrt. Der Maintainer erhält keine Nutzerdaten. Wer Belege oder Kontoauszüge an einen KI-Dienst gibt, verarbeitet sie in eigener Verantwortung (siehe `docs/KI-ANLEITUNG.md`).

## Beiträge Dritter

Issues, Pull Requests und Kommentare sind öffentlich. Sie dürfen keine echten personenbezogenen, Bank-, Verbrauchs- oder Belegdaten enthalten. Versehentlich veröffentlichte Daten werden über ein privates Security Advisory gemeldet und vom Maintainer entfernt.

Automatisierte Prüfungen blockieren bekannte private Dateipfade und typische Umgebungsdateien. Sie ersetzen keine menschliche Datenschutzprüfung.
