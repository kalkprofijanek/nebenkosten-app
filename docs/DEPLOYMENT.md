# Deployment und Release

## Status

Das Repository ist öffentlich. Die Anwendung selbst ist noch nicht über
GitHub Pages veröffentlicht. Der Workflow
`.github/workflows/pages.yml` wird ausschließlich manuell gestartet und
akzeptiert nur `main` als Quelle. Ein Merge allein löst kein Deployment aus.

GitHub Pages veröffentlicht bei einem öffentlichen Repository eine öffentlich
erreichbare statische Anwendung. Produktive Abrechnungsdaten sind kein Teil des
Builds: Sie bleiben im Browser beziehungsweise in lokal exportierten Dateien.

## Voraussetzungen

Vor dem ersten Deployment müssen alle Punkte erfüllt sein:

1. PR 13 ist geprüft und nach `main` gemergt.
2. Der Branch `main` ist geschützt; mindestens die bestehenden CI- und
   Guardrail-Prüfungen sind vor dem Merge verpflichtend.
3. In den Repository-Einstellungen ist GitHub Pages mit **GitHub Actions** als
   Quelle aktiviert.
4. Die menschliche Freigabe für das öffentliche Go-live liegt vor.
5. Der Commit für Version `1.0.0` ist eindeutig bestimmt.

Aktuelle GitHub-Dokumentation:

- [Eigene GitHub-Pages-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Geschützte Branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

## Reproduzierbarer Build

Verbindliche lokale Toolchain: Node.js `22.23.1` und pnpm `11.7.0`.

```powershell
pnpm install --frozen-lockfile
pnpm privacy:scan
pnpm build
pnpm verify:deployment-artifact
pnpm test:e2e
```

Das freigegebene Artefakt liegt ausschließlich in `apps/web/dist`. Der Guard
fordert `index.html`, erlaubt nur statische Dateitypen, folgt keinen Symlinks
und begrenzt Tiefe, Verzeichniseinträge, Dateizahl, Einzel- und Gesamtgröße. Er blockiert
personenbezogene Muster, Schlüssel, starke Tokenmuster, lokale Benutzerpfade,
Backups, JSON, PDF, ZIP, Source Maps, versteckte Dateien und `private-data`.

Zwei geprüfte Treffer in minimierten Bibliotheken sind an Pfad, Zeile und den
vollständigen SHA-256-Hash der jeweiligen Datei gebunden. Jede Byteänderung
macht diese Ausnahme automatisch ungültig.

Nach der Prüfung erzeugt der Workflow ein festes `artifact.tar` und lädt
genau dieses Archiv unveränderlich hoch. Ein separater Job auf einem frischen
Runner lädt anschließend dasselbe Archiv herunter und prüft dessen Tar-Header,
Checksummen, Eintragstypen und vollständigen statischen Inhalt. Erst danach
darf der Deployment-Job genau dieses GitHub-Artefakt verwenden.

## Browser-Schutz

Die ausgelieferte HTML-Hülle setzt eine Content Security Policy mit
`connect-src 'none'`. Die Anwendung benötigt keine API, Telemetrie oder
Fremdserver-Verbindung. Skripte und Styles werden nur aus demselben Ursprung
geladen; Objekte und Formularübertragungen sind gesperrt. Ein Browser-E2E-Test
prüft CSP, Hash-Navigation und das Ausbleiben fremder Requests.

## Deployment

Nach separater Go-live-Freigabe:

1. GitHub öffnen: **Actions → GitHub Pages Deployment**.
2. **Run workflow** ausschließlich auf `main` wählen.
3. Die Jobs `pages-build` und `pages-deploy` vollständig abwarten.
4. Die ausgegebene Pages-URL in einem privaten Browserprofil öffnen.
5. Startseite, Hash-Navigation, lokales Speichern, PDF/ZIP und Backup mit
   ausschließlich fiktiven Daten prüfen.
6. Erst danach den Release-Tag `v1.0.0` separat freigeben und erstellen.

Die Workflow-Actions sind auf unveränderliche Commit-SHAs gepinnt. Der
Build-Job hat nur Leserechte; nur der getrennte Deployment-Job erhält
Schreibrechte für Pages und das OIDC-Identitätstoken der Umgebung
`github-pages`.

## Rollback

Bei einem fehlerhaften Deployment:

1. Keine produktiven Browserdaten löschen oder hochladen.
2. Den fehlerhaften Code per Pull Request zurücksetzen.
3. Nach grüner CI den korrigierten `main`-Stand erneut manuell deployen.
4. Den Release-Tag erst nach erfolgreichem Smoke-Test setzen beziehungsweise
   bei bereits erfolgtem Release einen neuen Korrektur-Tag verwenden. Tags
   werden nicht verschoben.

Produktive Originaldatei, Legacy-App und lokale Backups bleiben unabhängig vom
Deployment erhalten.
