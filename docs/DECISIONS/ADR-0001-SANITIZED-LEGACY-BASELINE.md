# ADR-0001: Sanitisierte Legacy-Baseline in GitHub

- Status: angenommen
- Datum: 2026-07-13

## Kontext

Der erste GitHub-Root enthielt in `legacy/index.html` geschäftliche und operative Identifikatoren. Weitere konkrete Werte wurden vorübergehend in einem PR-01-Dokumentationscommit wiederholt. Das Repository wurde daraufhin privat gestellt und `main` als parentloser, sanitisierter Root-Commit neu aufgebaut. Diese Sanitisation ist noch nicht als vollständige Anonymisierung nachgewiesen.

Die Sanitisation ersetzte nicht nur Kontaktdaten, sondern auch Seed-, Zuordnungs- und Klassifizierungswerte. Deshalb kann die GitHub-Datei in diesen Bereichen nicht mehr als vollständig verhaltensgleiche Kopie der produktiven App gelten.

## Entscheidung

1. Die produktive Original-App bleibt ausschließlich lokal unter `C:\Projekte\nebenkosten-app-alt\index.html` und wird niemals nach GitHub übertragen.
2. `legacy/index.html` in GitHub ist die sanitisierte, noch nicht abschließend anonymitätsgeprüfte Migrationsbaseline. Ihr verbindlicher SHA-256 lautet `874af27415add7aeea330592c3e45da78a7c3e20e46dfcb8d71abbba6d21abab`.
3. Ab dem bereinigten Root-Commit wird diese Datei unverändert geschützt.
4. Characterization Tests verwenden ausschließlich nachweislich anonymisierte Fixtures. Fachliche Vergleiche mit dem produktiven Original erfolgen lokal und dürfen weder Eingaben noch Ergebnisse nach GitHub übertragen.
5. Das Repository bleibt privat, bis GitHub Support die Dereferenzierung der belasteten PR-Refs, die Entfernung von Cached Views und die serverseitige Garbage Collection bestätigt hat und eine dokumentierte erneute Inhalts-/Denylist-Prüfung der gesamten erreichbaren Historie bestanden ist.

## Konsequenzen

- Der Masterplan-Grundsatz „Legacy unverändert“ gilt für GitHub ab der sanitisierten Baseline, nicht rückwirkend für die lokale produktive Originaldatei.
- Verhaltensunterschiede in bereinigten Seed- und Klassifizierungsbereichen müssen in der Behavior Map und späteren Characterization Tests sichtbar ausgewiesen werden.
- Alte Commits oder PR-Refs dürfen niemals gemergt, cherry-gepickt oder erneut gepusht werden.
