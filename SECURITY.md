# Sicherheit

## Sicherheitslücken melden

Bitte keine sensiblen Details in öffentlichen Issues veröffentlichen. Verwende stattdessen die privaten Security Advisories des GitHub-Repositorys.

## Daten, die nie committed werden dürfen

- produktive JSON-Exporte und `nk-daten.json`
- Mieter-, Eigentümer-, Bank- und Zahlungsdaten
- Rechnungen, Belege, Zählernummern und echte Verbrauchsdaten
- nicht anonymisierte Abrechnungen oder technische Objektunterlagen
- `.env`-Dateien, Zugangsdaten, Tokens und private Schlüssel

Bei versehentlicher Veröffentlichung ist die Arbeit zu stoppen. Geheimnisse müssen sofort rotiert und betroffene Git-Historie sowie ähnliche Fundstellen geprüft werden.
