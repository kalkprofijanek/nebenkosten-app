# Review- und Branch-Schutz

## Branch-Modell

- `main` ist der geschützte Integrationsstand.
- Codex arbeitet auf `agent/codex-<task>`.
- Fable arbeitet auf `agent/fable-<task>`.
- Jeder Agent verwendet einen eigenen Worktree.

## Vorgesehener Schutz für `main`

- Pull Request erforderlich
- mindestens ein Review
- offene Review-Kommentare müssen erledigt sein
- erfolgreiche Statusprüfung `repository-guardrails`
- Force-Push und Branch-Löschung gesperrt
- Branch muss vor dem Merge aktuell sein
- Merge bleibt eine menschliche Entscheidung

Der Schutz wird nach Verfügbarkeit des Guardrail-Checks aktiviert und anschließend praktisch mit PR 00 verifiziert. Direkte Pushes auf `main` sind unabhängig davon organisatorisch verboten.
