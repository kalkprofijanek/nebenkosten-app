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

## Umsetzungsstand

- Belegprüfung (Punkt 2) mit PR-40 umgesetzt: `pnpm belegpruefung`,
  Verknüpfung über `receiptReference` (E-41-1 entschieden, siehe PR-40).
- Anleitung (Punkt 3) in `docs/KI-ANLEITUNG.md` Ablauf 0 ergänzt.
- Offen: Arbeitsanweisung für den Agenten zur Ordnerverarbeitung
  (Erfassungsliste mit Dateiname als Quelle) präzisieren.

## Entscheidungen (Nutzer, 23.10.2026)

- **E-41-2:** Zusätzlich Betragsabgleich. Der Agent liest die Rechnungen
  **unabhängig neu** (KI-Erfassungsliste als Format), die App vergleicht
  deterministisch: `compareReceiptAmounts` in `packages/validators`,
  `pnpm belegpruefung … --erfassungsliste <datei>`; Toleranz 1 Cent,
  Summe je Rechnung, Kennzeichnung bei Leistungszeitraum über den
  Jahreswechsel.
