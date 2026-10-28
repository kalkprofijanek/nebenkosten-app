# PR-50 – CI- und Release-Härtung

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026,
Härtungshinweise. Priorität 3. Kein bestätigter Befund; die CI-Kette ist
bereits sauber (keine `pull_request_target`-Trigger, Actions per SHA gepinnt,
Token nur mit Leserecht).

## Umfang

1. **Install-Skripte:** `pnpm-workspace.yaml` bekommt eine ausdrückliche
   Allowlist für Abhängigkeiten mit Build-Skripten (`onlyBuiltDependencies`
   bzw. das pnpm-11-Äquivalent). Bisher hängt das am Standardverhalten von
   pnpm 11.
2. **pnpm-Integrität:** `packageManager` in `package.json` mit Hash
   (`pnpm@11.7.0+sha512.<hash>`). `corepack prepare` in
   `.github/actions/setup-workspace/action.yml` übernimmt ihn.
3. **Archivprüfer** (`scripts/verify-deployment-archive.mjs`):
   - doppelte normalisierte Pfade ablehnen;
   - ustar-Magic prüfen, bevor das Prefix-Feld ausgewertet wird.
4. **`.gitignore`:** `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`
   ergänzen. `scripts/verify-repository-guardrails.mjs` prüft das mit
   `git check-ignore`.
5. **CLI-Skripte** (`scripts/abrechnung.mjs`, `scripts/belegpruefung.mjs`,
   `scripts/run-production-acceptance.mjs`): Vite in `middlewareMode` mit
   `server.hmr: false` und `server.ws: false` erzeugen. Für `ssrLoadModule`
   wird kein lokaler WebSocket gebraucht.
6. **`setup-node`:** die Composite-Action (v4) auf dieselbe SHA wie
   `guardrails.yml` (v7) anheben.
7. **Repository-Einstellung (Inhaber):** „Send write tokens to workflows from
   fork pull requests“ bleibt aus. Das wird wichtig, falls das Repository
   privat wird. In `SECURITY.md` dokumentieren.

## Vertrag

Keine Änderung an App-Verhalten, Schema oder Build-Ausgabe.

## Freigegebene Pfade

`package.json`, `pnpm-workspace.yaml`, `.github/actions/`, `.gitignore`,
`scripts/verify-deployment-archive.mjs`,
`scripts/verify-repository-guardrails.mjs`, `scripts/abrechnung.mjs`,
`scripts/belegpruefung.mjs`, `scripts/run-production-acceptance.mjs`,
`tests/repository/`, `SECURITY.md`, `CHANGELOG.md`, `docs/TASKS/`.

## Tests (zuerst schreiben)

- `tests/repository/deployment-archive.test.mjs`: Archiv mit doppeltem Pfad
  wird abgelehnt; altes GNU-Format ohne ustar-Magic wird nicht über das
  Prefix-Feld ausgewertet.
- `tests/repository/verify-repository-guardrails.test.mjs`: `x.pem` und
  `credentials.json` gelten als ignoriert.
- CI: `pnpm install --frozen-lockfile` läuft mit Allowlist unverändert durch.
