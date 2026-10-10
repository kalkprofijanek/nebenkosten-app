# Dependency-Prüfung zu PR 69

Auftrag: Nutzer vom 10. Oktober 2026, Punkt 13. Eigenes Worktree und Branch;
20 Updates aus PR 69 auf den aktuellen Hauptstand übernommen. Keine Änderungen
an Schema-/Core-Quellcode. Zusätzlich erforderlicher Pfad: apps/web/tsconfig.json.

## Befund und Korrektur

Der unveränderte PR scheitert im Typecheck und Build: Die Web-tsconfig lädt
die Jest-Typen von jest-dom, während die Tests Vitest verwenden. Mit Vitest 5
fehlen dadurch DOM-Matcher wie toBeInTheDocument. Der explizite Typeneintrag
@testing-library/jest-dom/vitest behebt die fehlende Erweiterung. Runtime-Setup
tests/setup-vitest.ts verwendet diesen Einstieg bereits.

## Prüfung

Node 22.23.1, pnpm 11.7.0. Frozen-Lockfile-Installation ohne Änderung,
Format, Lint, Typecheck, Architektur-/Repository-/Datenschutztests,
487 Web-Tests, Pakettests, 18 Integrationstests, 10 Migrationstests,
274 Charakterisierungstests, Coverage-Gates, Build, Deployment-Artefakt,
Privacy-Scan und Audit erfolgreich. Audit: keine bekannten Schwachstellen.
Ein Integrationstest überschritt unter paralleler Last 5 Sekunden; der
unveränderte zweite vollständige Integrationstestlauf bestand alle 18 Fälle.

Der Playwright-Browserdownload ist in der Cloud durch die Netzwerkpolicy
gesperrt (cdn.playwright.dev, HTTP 403). Browserprüfungen verwenden daher den
vorinstallierten Chromium über die vorhandene Konfigurationsoption.

Die Updates müssen nicht aufgeteilt werden, sofern die GitHub-CI den
geprüften Stand bestätigt. PR 69 bleibt unverändert offen; dieser Branch
enthält die notwendige Konfigurationskorrektur. Kein automatischer Merge.
