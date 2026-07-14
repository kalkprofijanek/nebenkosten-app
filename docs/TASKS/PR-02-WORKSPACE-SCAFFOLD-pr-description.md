# PR 02 – Workspace und TypeScript-Scaffold

## Zusammenfassung

- richtet einen pnpm-Workspace mit Vite, React und TypeScript ein
- legt die acht geplanten, API-neutralen Pakethüllen an
- ergänzt ESLint, Prettier, Vitest, Playwright und getrennte Coverage-Gates
- erweitert GitHub Actions um einzeln erzwingbare Format-, Lint-, Typ-, Test-, Coverage-,
  Build-, E2E-, Privacy- und Security-Jobs
- lässt `legacy/index.html` und sämtliche Fachlogik unverändert

## Sicherheits- und Datenschutzgrenzen

- keine echten Personen-, Objekt-, Bank-, Verbrauchs- oder Abrechnungsdaten
- keine Secrets, externen Assets, Deployments oder GitHub Pages
- CI mit Leserechten, SHA-fixierten Actions und ohne gespeicherte Checkout-Zugangsdaten
- bestehender Legacy-Hash und Repository-Guard bleiben unabhängig ausführbar
- ein getesteter Inhalts-Scan erkennt konkrete personenbezogene und secret-ähnliche Werte
- Binärdateien schlagen standardmäßig fehl; das Lockfile erlaubt nur Registry-Integritäten
  und interne Workspace-Links

## Testplan

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm privacy:scan`
- `pnpm security:audit`

## Review

Codex führt Implementierung, lokale Verifikation, Code- und Sicherheitsreview durch. Danach
geht der Draft-PR an Claude zum Gegenreview. Codex merged diesen PR nicht.

## Paket-Builds

Die privaten Pakete bleiben in PR 02 absichtlich source-first. Ihre Build-Skripte erzeugen
isolierte `dist/`-Ausgaben als Kompilierbarkeitsnachweis; eine veröffentlichte Artefakt-API
wird erst zusammen mit den echten Paketverträgen festgelegt.
