# ADR-0012: Screenshots und Musterabrechnungen im Repository

- Status: vorgeschlagen (Entscheidung des Maintainers offen, siehe unten)
- Datum: 2026-10-17
- Anlass: Für Dritte (private Vermieter ohne Programmierkenntnisse) fehlten
  im Repository Bildschirmfotos, Bedienhinweise mit Bildern und fertige
  Musterabrechnungen. Wer die App nicht kennt, kann vor dem ersten Klick
  nicht sehen, was sie liefert.

## Kontext

Der Privacy-Scan (`scripts/scan-repository-content.mjs`) lehnt jede
versionierte Binärdatei ab („fail closed“), weil Bilder und PDFs sich nicht
auf Namen, IBANs oder Anschriften durchsuchen lassen. Diese Regel hat bisher
verhindert, dass Screenshots oder PDFs mit echten Daten veröffentlicht werden
– und zugleich, dass es überhaupt Bilder gibt.

## Entscheidung

1. **Ein einziger Ordner für Binärdateien:** `docs/medien/`. Außerhalb bleibt
   jede Binärdatei verboten.
2. **Hash-Manifest:** Eine Datei in `docs/medien/` ist nur zulässig, wenn ihr
   SHA-256 in `docs/medien/SHA256SUMS` steht (Format wie
   `legacy/SHA256SUMS`). Jede neue oder geänderte Datei erzeugt damit eine
   sichtbare Manifest-Zeile im Pull Request; der Scan schlägt sonst fehl.
   Pfade mit `..` können nicht aus dem Ordner herausführen, weil der
   Manifest-Pfad an `docs/medien/` angehängt und mit dem tatsächlichen Pfad
   verglichen wird.
3. **Herkunft nur aus dem fiktiven Beispielobjekt:** Alle Dateien erzeugt
   `pnpm medien` (`scripts/erzeuge-medien.mjs`) aus
   `docs/beispiel/beispielobjekt.json` – PDFs über `pnpm abrechnung`
   (dieselbe Fachlogik wie die App), Screenshots über
   `tests/e2e/medien.spec.ts`. Von Hand eingefügte Bilder sind nicht
   vorgesehen.
4. **Der E2E-Rundgang läuft auch ohne Aktualisierung** als normaler Test mit
   und bricht, wenn sich Oberfläche oder Beispielobjekt so ändern, dass die
   Bilder nicht mehr entstehen.

## Vertrag und Tests

- `parseReleasedMediaManifest(content)` liest nur Zeilen
  `<64 hex>␠␠<pfad>`; fehlerhafte Zeilen werden ignoriert.
- `scanRepository` meldet weiterhin `tracked binary file` für jede Binärdatei
  außerhalb von `docs/medien/`, ohne Manifest-Eintrag oder mit abweichendem
  Hash (`tests/privacy/scan-repository-content.test.mjs`).
- Keine Schema-, Rechen- oder Datenmigration betroffen.

## Restrisiko

Der Scan prüft den **Inhalt** der Bilder nicht. Schutz bieten die
Herkunftsregel (nur Beispielobjekt), CODEOWNERS-Review jeder Manifest-Zeile
und der Hinweis in `CONTRIBUTING.md`. Wer einen Screenshot mit echten Daten
erzeugt, muss ihn zusätzlich bewusst ins Manifest eintragen.

## Offene Entscheidung

- Soll der Maintainer Manifest-Änderungen ausschließlich selbst vornehmen
  (z. B. eigene CODEOWNERS-Zeile für `docs/medien/SHA256SUMS`)? Derzeit
  gilt `* @kalkprofijanek` für alle Dateien.
- Alternative ohne Binärdateien im Repository: Bilder und PDFs nur im
  GitHub-Pages-Build erzeugen und von dort verlinken. Verworfen, weil die
  Dateien dann im Repository nicht sichtbar und nicht versioniert wären;
  bei Bedarf umkehrbar (Ordner und Manifest löschen).
