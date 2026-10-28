# PR-49 – Eigene Browser-Herkunft und Pages-Absicherung

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026, Spur 1.
Priorität 1. Teil A ist eine Aufgabe des Inhabers außerhalb des Codes.

## Anlass

- Die App läuft unter `https://kalkprofijanek.github.io/nebenkosten-app/`.
- Browser trennen IndexedDB nach Herkunft (Schema, Host, Port), nicht nach
  Pfad. Alle Pages-Seiten des Kontos `kalkprofijanek` teilen sich deshalb
  denselben Speicher.
- Die Abrechnungsdaten liegen dort unverschlüsselt in der Datenbank
  `nebenkosten-app-v4`. Die Prüfsumme beim Laden ist ein ungeschlüsselter
  SHA-256 und schützt nicht gegen Änderungen durch ein Skript derselben
  Herkunft.
- Ein Schlüssel im Browser hilft gegen ein Skript derselben Herkunft nicht.
  Wirksam ist nur eine eigene Herkunft.

## Umfang

### Teil A – Inhaber (ohne Code)

1. Im Konto `kalkprofijanek` alle Repositories mit aktivem GitHub Pages
   prüfen (Settings → Pages), insbesondere `kalkpilot-by-janek`,
   `Reiseplan` und ein mögliches Repository `kalkprofijanek.github.io`.
2. Für jede gefundene Seite festhalten, wer dorthin veröffentlichen darf.
3. Herkunft festlegen (E-49-1).
4. Environment `github-pages` in den Repository-Einstellungen auf den
   Branch `main` beschränken (Deployment branches and tags).

### Teil B – Repository

1. `pages.yml`: Prüfung `github.ref == 'refs/heads/main'` zusätzlich im
   Deploy-Job; Verify- und Deploy-Job an `artifact-id`/`artifact-digest` des
   Build-Jobs binden statt an den Artefaktnamen.
2. Je nach E-49-1: `CNAME` bzw. Domain-Konfiguration; README-Links,
   `docs/DEPLOYMENT.md` und `docs/PRIVACY.md` anpassen.
3. `docs/PRIVACY.md`: ausdrücklich nennen, dass der Browser-Speicher an die
   Herkunft gebunden ist, und welche Herkunft die App verwendet.
4. Widerspruch beheben: README („wird mit jedem Merge auf `main`
   aktualisiert“) gegenüber `pages.yml` (nur `workflow_dispatch`) und
   `docs/DEPLOYMENT.md`.
5. Umzug auf eine neue Herkunft: Die Daten im alten Browser-Speicher sind
   unter der neuen Herkunft nicht sichtbar. Hinweis in README und App
   aufnehmen: „vor dem Wechsel Sicherung exportieren, danach importieren“.

## Vertrag

Keine Änderung an Schema, Persistenzformat oder Datenbankname. Der
Datenbankname bleibt `nebenkosten-app-v4`.

## Freigegebene Pfade

`.github/workflows/pages.yml`, `apps/web/public/` (nur `CNAME`), `README.md`,
`docs/DEPLOYMENT.md`, `docs/PRIVACY.md`, `docs/RELEASE-STATUS.md`,
`tests/architecture/` (Prüfungen von `pages.yml`), `CHANGELOG.md`,
`docs/TASKS/`.

## Tests

- `tests/architecture`: Der Deploy-Job verlangt `refs/heads/main`, und
  Verify/Deploy referenzieren die Artefakt-ID aus dem Build-Job.
- `pnpm verify:deployment-artifact` lässt `CNAME` zu, falls E-49-1 eine
  eigene Domain wählt (Erweiterung der Allowlist mit Test).

## Offene Entscheidungen

- **E-49-1 – Herkunft der App:**
  - A = eigene Domain (z. B. Subdomain einer eigenen Domain, per CNAME auf
    Pages). Empfehlung.
  - B = eigene GitHub-Organisation nur für diese App, also
    `<org>.github.io`.
  - C = beim github.io-Konto bleiben und dort dauerhaft keine weiteren
    Pages-Seiten betreiben. Nur organisatorisch abgesichert.
