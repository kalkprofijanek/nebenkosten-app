# Datenschutz

Neue Inhalte auf GitHub sind auf Quellcode, Dokumentation und vollständig anonymisierte Testdaten beschränkt. Produktive Dateien werden lokal unter `private-data/` abgelegt; der gesamte Pfad ist ignoriert. Die aktuelle Legacy-Baseline ist sanitisiert, aber noch nicht abschließend anonymitätsgeprüft. Das Repository bleibt bis zum Abschluss der Historien- und Inhaltsprüfung privat.

## Verbotene Repository-Inhalte

- Namen, Anschriften oder E-Mail-Adressen realer Mieter
- Bank- und Zahlungsdaten
- Rechnungen, Belege und nicht anonymisierte Abrechnungen
- Zählernummern, echte Verbrauchs- und Objektdokumente
- OneDrive-Dateien, Backups und lokale Exporte

Der ursprüngliche Legacy-Snapshot enthielt vorbestehende geschäftliche und operative Referenzangaben. Nach einem Datenschutzvorfall wurde `main` als neuer, sanitisierter Root-Commit aufgebaut. Diese Bereinigung ist noch nicht als vollständige Anonymisierung nachgewiesen. Der GitHub-Snapshot ist nicht bytegleich mit der produktiven Original-App und kann in bereinigten Seed- und Klassifizierungsbereichen abweichendes Verhalten zeigen. Der produktive Originalstand verbleibt ausschließlich lokal.

Geschlossene Pull-Request-Refs und alte Commit-Objekte können trotz History-Rewrite weiterhin erreichbar sein. Das Repository darf nur dann jemals öffentlich gestellt werden, wenn GitHub Support deren Dereferenzierung, Cached-View-Bereinigung und serverseitige Garbage Collection bestätigt hat **und** eine dokumentierte erneute Inhalts-/Denylist-Prüfung der gesamten erreichbaren Historie keine operativen oder personenbezogenen Identifikatoren findet. Details stehen in `docs/DECISIONS/ADR-0001-SANITIZED-LEGACY-BASELINE.md`.

Automatisierte Prüfungen blockieren bekannte private Dateipfade und typische Umgebungsdateien. Sie ersetzen keine menschliche Datenschutzprüfung.
