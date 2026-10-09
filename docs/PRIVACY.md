# Datenschutz

Neue Inhalte auf GitHub sind auf Quellcode, Dokumentation und vollständig anonymisierte Testdaten beschränkt. Produktive Dateien werden lokal unter `private-data/` abgelegt; der gesamte Pfad ist ignoriert. Das Repository ist öffentlich. Vor der Veröffentlichung wurde die Historie bereinigt (Bestätigung durch GitHub Support, erneute Inhaltsprüfung der gesamten erreichbaren Historie).

## Verbotene Repository-Inhalte

- Namen, Anschriften oder E-Mail-Adressen realer Mieter
- Bank- und Zahlungsdaten
- Rechnungen, Belege und nicht anonymisierte Abrechnungen
- Zählernummern, echte Verbrauchs- und Objektdokumente
- OneDrive-Dateien, Backups und lokale Exporte

Die frühere Einzeldatei-App ist nicht Teil des Repositorys; ihr produktiver Originalstand verbleibt ausschließlich lokal. Alte, bereinigte Commits oder Pull-Request-Refs dürfen niemals gemergt, cherry-gepickt oder erneut gepusht werden; auch Pull Requests aus Forks dürfen keine Inhalte daraus wieder einführen.

## Nutzerdaten der veröffentlichten App

Die App unter GitHub Pages verarbeitet alle Eingaben ausschließlich lokal im Browser (IndexedDB); ausgehende Verbindungen sind per Content Security Policy gesperrt. Der Maintainer erhält keine Nutzerdaten. Wer Belege oder Kontoauszüge an einen KI-Dienst gibt, verarbeitet sie in eigener Verantwortung (siehe `docs/KI-ANLEITUNG.md`).

## Beiträge Dritter

Issues, Pull Requests und Kommentare sind öffentlich. Sie dürfen keine echten personenbezogenen, Bank-, Verbrauchs- oder Belegdaten enthalten. Versehentlich veröffentlichte Daten werden über ein privates Security Advisory gemeldet und vom Maintainer entfernt.

Automatisierte Prüfungen blockieren bekannte private Dateipfade und typische Umgebungsdateien. Sie ersetzen keine menschliche Datenschutzprüfung.
