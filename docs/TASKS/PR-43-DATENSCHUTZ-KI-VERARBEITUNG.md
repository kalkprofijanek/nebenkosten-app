# PR-43 – Datenschutz bei der Verarbeitung mit KI

Stand: 17. Oktober 2026. Auftrag: Roadmap Phase 3, Punkt 6 (Querschnitt,
Voraussetzung für PR-40 und PR-41).

## Ziel

Verbindliche Regeln, wie Belege, Kontoauszüge und Abrechnungsdaten mit
Claude Code, Codex oder einem KI-Chat verarbeitet werden – für den
Maintainer und für andere private Vermieter. Ergebnis ist
`docs/DATENSCHUTZ-KI.md` (Entwurf in diesem PR) mit Verweisen aus
`docs/PRIVACY.md` und `docs/KI-ANLEITUNG.md`.

## Umfang

1. Rollen und Rechtsgrundlagen (Vermieter als Verantwortlicher,
   KI-Anbieter als Auftragsverarbeiter nur bei geschäftlichen Bedingungen).
2. Datenkategorien je Quelle und Minimierung (was die KI sehen darf).
3. Technische Regeln für lokale Agenten (Arbeitsverzeichnis,
   Berechtigungen, keine Cloud-Sitzungen mit echten Daten,
   Repository-Schutz).
4. Regeln für die Ordnerverknüpfung (PR-40): Pfade und Objektkürzel nur
   privat, nie im öffentlichen Repository.
5. Checkliste vor dem ersten Einsatz und je Abrechnungsjahr.
6. Folgeprüfung: Datenschutzinformation für Mieter (Art. 13 DSGVO) um
   Empfängerkategorie „IT-/KI-Dienstleister“ ergänzen.

## Freigegebene Pfade

`docs/`, `README.md` (Verweis).

## Offene Entscheidungen

- **E-43-1:** Welcher Tarif/Anbieter wird produktiv genutzt (Verbraucher-
  oder Geschäftstarif, AVV vorhanden)? Bestimmt, ob echte Belege überhaupt
  an den Dienst gehen dürfen.
- **E-43-2:** Sollen Kontoauszüge vor der KI-Vorkontierung automatisch
  pseudonymisiert werden (Mieternamen → Einheitskürzel)? Wäre ein
  eigenes lokales Skript.
- **E-43-3:** Technische Sperre zusätzlich zur Dokumentation, z. B. Hook,
  der Commits mit Pfaden aus `private-data/objekt-ordner.json` blockiert.
- Rechtliche Einschätzungen im Entwurf sind keine Rechtsberatung und vor
  Veröffentlichung fachlich zu prüfen.
