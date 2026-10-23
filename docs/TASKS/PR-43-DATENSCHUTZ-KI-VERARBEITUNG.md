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

## Entscheidungen (Nutzer, 17.10.2026)

- **E-43-1:** Produktiv wird ein Geschäftstarif genutzt. Grundsatz: Der
  Nutzer entscheidet stets selbst, was verarbeitet wird. Dokumentation und
  Workflow geben Empfehlungen und fragen nach, sperren aber nichts – außer
  der Veröffentlichung echter Daten im Repository (AGENTS.md Regel 5).
- Echte Objektkürzel und Ordnerpfade bleiben außerhalb des Repositorys;
  Beispiele verwenden ausschließlich Platzhalter (`Objekt-A`, `Objekt-B`).

## Umsetzungsstand (23.10.2026)

- `docs/DATENSCHUTZ-KI.md` als endgültige Fassung (Entwurfsvermerk entfernt),
  ergänzt um Monatsinformation, Belegprüfung und Mieterinformation.
- `docs/DATENSCHUTZ-MIETERINFORMATION.md`: Muster nach Art. 13 DSGVO mit
  Empfängerkategorie IT-/KI-Dienstleister, Drittland, Speicherdauer und
  Einwilligung in den E-Mail-Versand.

## Zurückgestellt

- **E-43-2** (Pseudonymisierung von Kontoauszügen) und **E-43-3**
  (technische Commit-Sperre): bewusst nicht umgesetzt; Begründung in
  `docs/DATENSCHUTZ-KI.md` Abschnitt 6.
- Rechtliche Einschätzungen sind keine Rechtsberatung; vor Verwendung
  fachlich prüfen.
