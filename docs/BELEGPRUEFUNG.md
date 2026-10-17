# Belegprüfung mit dem Rechnungsordner je Objekt

Die Belegprüfung zeigt, ob zu den angesetzten Kosten eines Jahres eine
Rechnung im **bestehenden** Rechnungsordner des Objekts liegt. Die
Originale bleiben, wo sie sind: Es gibt kein Uploadarchiv und keine
zusätzliche Datenbank. Datendatei und Ordner werden nur gelesen.

## 1. Ordner zuordnen (einmalig, nur lokal)

Legen Sie `private-data/objekt-ordner.json` an. Der Ordner `private-data/`
wird nie committet; die Datei gehört auch nicht in die Datensicherung.

```json
{
  "version": 1,
  "objects": [
    {
      "propertyId": "prop-1",
      "invoiceFolder": "C:\\Immobilien\\Objekt-A\\Rechnungseingang"
    }
  ]
}
```

- `propertyId` ist die ID des Objekts in der Datendatei (nicht der Name).
- Relative Pfade gelten relativ zur Zuordnungsdatei.
- Unterordner werden mitgelesen; System- und Sperrdateien (`.…`, `~$…`,
  `Thumbs.db`, `desktop.ini`) werden übergangen.

## 2. Kostenposition und Rechnung verknüpfen

Tragen Sie bei der Kostenposition bzw. Brennstofflieferung unter
**Belegnummer/Dateiname** den Dateinamen der Rechnung ein. Erkannt werden
(ohne Groß-/Kleinschreibung):

- der Pfad im Ordner, z. B. `2025/Wasser-Jahresrechnung.pdf`,
- der Dateiname, z. B. `Wasser-Jahresrechnung.pdf`,
- der Dateiname ohne Endung, z. B. `Wasser-Jahresrechnung`.

Beim Auslesen mit der KI (siehe [`KI-ANLEITUNG.md`](KI-ANLEITUNG.md),
Ablauf 0) trägt der Agent den Dateinamen als Quelle in diese Spalte ein.

## 3. Prüfen

```
pnpm belegpruefung <datendatei.json> --jahr 2025
```

Optionen: `--zuordnung <datei>` (Standard
`private-data/objekt-ordner.json`), `--json <datei>` für eine
maschinenlesbare Ausgabe.

| Befund                         | Bedeutung                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Kosten ohne Belegangabe        | Kostenposition/Lieferung ohne Dateiname; Schätzungen sind ausgenommen                                     |
| Beleg nicht im Ordner gefunden | Angabe passt zu keiner Datei – Tippfehler, reine Belegnummer oder Rechnung fehlt                          |
| Beleg mehrfach angesetzt       | dieselbe Rechnung an mehreren Stellen; korrekt, wenn sie auf Kostenarten aufgeteilt wurde, sonst Duplikat |
| Dateien ohne Kostenposition    | Rechnung liegt im Ordner, ist aber nirgends angesetzt – möglicherweise vergessen                          |

**Abrechnungsjahr = Leistungszeitraum.** Rechnungen kommen oft erst im
Folgejahr. Die Prüfung ordnet Dateien deshalb nicht nach Ordner oder
Rechnungsdatum einem Jahr zu: „Dateien ohne Kostenposition“ werden
jahresunabhängig gelistet. Ob eine solche Rechnung in das geprüfte Jahr
gehört, entscheidet ihr Leistungszeitraum – geprüft von Ihnen oder vom
KI-Agenten anhand des Belegs.

## Datenschutz

Die Prüfung läuft lokal und überträgt nichts. Ob ein KI-Agent die
Rechnungen im Ordner liest, entscheiden Sie je Schritt (siehe
[`DATENSCHUTZ-KI.md`](DATENSCHUTZ-KI.md)). Echte Ordnerpfade und
Objektkürzel gehören nie in das Repository.
