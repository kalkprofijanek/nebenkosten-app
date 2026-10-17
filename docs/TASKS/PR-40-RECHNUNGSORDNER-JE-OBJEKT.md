# PR-40 – Rechnungseingangsordner je Objekt verknüpfen

Stand: 17. Oktober 2026. Auftrag: Roadmap Phase 3, Punkt 2 (Priorität 2).
Abhängigkeit: PR-43 (Datenschutzregeln) vor der Umsetzung abstimmen.

## Ziel

Pro Objekt wird ein **bestehender** lokaler Ordner hinterlegt, in dem die
Eingangsrechnungen bereits liegen. Es entsteht **keine** eigene
Belegablage, kein Uploadarchiv und keine neue Datenbank. Die Originale
bleiben an ihrem Speicherort.

Beispielstruktur (fiktiv):

```
<Basisordner>\
  ├── Objekt-A\Rechnungseingang\
  └── Objekt-B\Rechnungseingang\
```

## Zwei Zugriffswege

| Weg                                     | Zugriff                                                                                                                               | Speicherort der Zuordnung                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| KI-Agent lokal (Claude Code, Codex)     | liest den Pfad direkt                                                                                                                 | private Datei `private-data/objekt-ordner.json` (ignoriert, nie committet) |
| Browser-App (GitHub Pages, Edge/Chrome) | nur nach Freigabe über Ordnerdialog (File System Access API, `showDirectoryPicker`), Lesezugriff, je Sitzung ggf. erneute Bestätigung | Ordner-Handle in IndexedDB des Browsers; kein Pfad, keine Übertragung      |

Firefox und Safari unterstützen den Ordnerdialog nicht; dort bleibt der
Agenten-Weg bzw. die bisherige Erfassung.

## Vorschlag Vertrag (vor Umsetzung abzustimmen)

- Private Zuordnungsdatei (nur Agentenweg):
  `{ "version": 1, "objects": [{ "propertyId": "…", "invoiceFolder": "…" }] }`
  – Schlüssel ist die `propertyId` der Datendatei, kein Objektname.
- Browser: eigener IndexedDB-Speicher `local-settings`, getrennt von
  `AppDataFile`. **Nicht** Teil von Datensicherung, Export oder Schema
  (keine Schemaänderung, keine Migration).
- Die App liest nur Dateinamen, Größe und Änderungsdatum; PDF-Inhalte
  verarbeitet ausschließlich der Agent (PR-41).

## Freigegebene Pfade (vorläufig)

`apps/web/src/features/` (neues Feature `invoice-folder`), `docs/`,
`scripts/`, `.gitignore`.

## Tests / Abnahme

- Unit: Lesen/Validieren der Zuordnungsdatei, unbekannte `propertyId`,
  fehlender Ordner, fehlende Leseberechtigung.
- Web: Ordnerfreigabe mit gemocktem `showDirectoryPicker`, Fallback-Hinweis
  ohne API-Unterstützung, Handle wird nicht exportiert.
- Datenschutz: Repository-Prüfung, dass keine Pfade/Objektkürzel
  committet werden.

## Offene Entscheidungen

- **E-40-1:** Ordnerauflistung in der App überhaupt anzeigen oder nur für
  die Belegprüfung (PR-41) nutzen?
- **E-40-2:** Unterordner je Jahr (`Rechnungseingang\2025\`) vorgeben oder
  Jahr aus Rechnungsdatum/Leistungszeitraum ableiten?
