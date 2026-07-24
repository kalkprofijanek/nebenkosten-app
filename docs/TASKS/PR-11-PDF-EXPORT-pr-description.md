# PR 11 – PDF und Export

## Ziel

Der Berechnungs-Snapshot wird erstmals in echte PDF-Dokumente überführt:
Einzelabrechnung je Mieter, objektweite Gesamtabrechnung/Kostenaufstellung
und ein ZIP-Sammelexport. Der bislang gesperrte „Finalisieren"-Übergang
(`FINALIZED`, mit Pflicht-Versanddatum) wird aktiviert.

## Inhalt

- neues Paket `packages/pdf`: reine, testbare Dokumentenlogik (kein
  Rendering, keine Browser-Abhängigkeit)
- Einzelabrechnung (DIN-5008-Layout, Kostenaufstellung, Heizkosten-
  Aufschlüsselung, CO₂-Ausweis, Anschreiben-Platzhalter, Hinweise,
  Liegenschaftsdaten nach § 259 BGB)
- Gesamtabrechnung/Kostenaufstellung mit Kontrollsummen-Zeile
- Sammel-ZIP-Export aller Einzelabrechnungen
- Freigabeprotokoll-Baustein (eingebettet und als eigenständiges Dokument)
- `apps/web/src/features/pdf/render.ts`: dynamisches Nachladen von
  `pdfmake`/`jszip` beim tatsächlichen Erzeugen, damit Haupt-Bundle und
  Ein-Datei-HTML-Vorschau klein bleiben
- neue Route „PDF und Export" (`/pdf-export`)
- Aktivierung des `FINALIZED`-Übergangs mit Pflicht-Versanddatum in
  `ReleaseRoute.tsx`
- neue Validator-Prüfung: fehlende Versandadresse blockiert `READY_FOR_PDF`
- additive Erweiterung von `packages/core`s `CalculationOutput` um eine
  Kostenart-Aufschlüsselung je Mieter (`costBreakdown`), ohne bestehende
  Summen/Charakterisierungstests zu verändern

## Bewusst reduzierter Umfang (mit dem Menschen abgestimmt)

Kein Eigentümer-Report, kein Sammel-PDF mit eigener Kontrollseite, kein
Hauswart-Vertragsblock (wirkte kundenspezifisch/hartcodiert), kein neuer
§12-HeizKV-Kürzungshinweistext (Legacy-Verhalten bewusst gespiegelt, eigene
fachlich-rechtliche Prüfung folgt separat), keine clientseitige
PDF-Vorschau vor Download.

## Verifikation

- `packages/pdf`, `packages/validators`, `packages/core`: eigene
  Coverage-Gates ≥ 80 % in allen vier Messgrößen, alle bestehenden Tests
  (inkl. 258 Charakterisierungstests) weiterhin grün
- `apps/web`: Root-Coverage weiterhin ≥ 80 % in allen vier Messgrößen
- vollständige Root-CI, Privacy-Scanner und Dependency-Audit grün
- `legacy/index.html` unverändert
- `pnpm run build:html-preview` manuell verifiziert: genau ein JS-Chunk
  trotz dynamischer PDF-/ZIP-Imports

## Nicht enthalten

- Eigentümer-Report, Sammel-PDF-Kontrollseite, Hauswart-Block (siehe oben)
- Produktionsmigration und Endabnahme (PR 12)

## Review

Diese PR wurde abweichend vom Masterplan (Codex verantwortlich, Claude
Review) direkt von Claude umgesetzt — mit dem Menschen vorab abgestimmt.
Eine unabhängige zweite Prüfung wird empfohlen, sobald verfügbar.
