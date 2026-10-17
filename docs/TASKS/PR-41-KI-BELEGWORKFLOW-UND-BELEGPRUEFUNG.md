# PR-41 – KI-Belegworkflow aus dem Objektordner und Belegprüfung

Stand: 17. Oktober 2026. Auftrag: Roadmap Phase 3, Punkte 3 und 4.
Abhängigkeit: PR-40 (Ordnerzuordnung), PR-43 (Datenschutz).

## Ziel

Den **vorhandenen** Workflow (`docs/KI-ANLEITUNG.md`, Ablauf 0 und A,
KI-Erfassungsliste) so ergänzen, dass der Agent die Rechnungen
zuverlässig aus dem verknüpften Objektordner verarbeitet. Kein neues
Belegarchiv, keine eigene Belegverwaltung.

## Umfang

1. **Belegauswertung:** Der Agent liest den Ordner aus
   `private-data/objekt-ordner.json`, ordnet jede Rechnung Abrechnungsjahr
   (Leistungszeitraum, nicht Rechnungsdatum) und Kostenart zu und erzeugt
   die bestehende KI-Erfassungsliste. Quelle je Zeile = relativer
   Dateiname im Objektordner (Feld „Belegnummer/Quelle“).
2. **Belegprüfung (Abgleich):** Neues Skript, z. B.
   `pnpm belegpruefung <nk-daten.json> --jahr 2025`: Für jede angesetzte
   Kostenposition wird geprüft, ob im Objektordner eine zugehörige Rechnung
   existiert (Abgleich über die Quellangabe aus Schritt 1). Ausgabe nur
   lokal (Konsole/`private-data/`), keine Änderung der Daten. Ergebnis:
   - Kostenposition ohne Beleg,
   - Beleg im Ordner ohne Kostenposition (möglicherweise vergessen),
   - Beleg mehrfach angesetzt (Duplikat).
3. Anleitung in `docs/KI-ANLEITUNG.md` ergänzen (Arbeitsanweisung für
   Ordnerverarbeitung, Prüfreihenfolge, Übergabe-Notiz).

## Grundsätze

- Die KI schlägt vor, der Mensch entscheidet (Umlagefähigkeit,
  Unplausibles). Rechnen ausschließlich in der Fachlogik.
- Originaldateien werden nie verschoben, umbenannt oder verändert.

## Offene Entscheidungen

- **E-41-1:** Verknüpfung Beleg ↔ Kostenposition über das vorhandene
  Belegnummer-/Beschreibungsfeld oder ein neues optionales Feld
  `sourceFile` (wäre Schemaänderung mit Migration, ADR nötig)?
- **E-41-2:** Abgleich nur auf Dateiebene oder zusätzlich Betrag
  (Agent liest Betrag aus PDF und vergleicht mit Kostenposition)?
