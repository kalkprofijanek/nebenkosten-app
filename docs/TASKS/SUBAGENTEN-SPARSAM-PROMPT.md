# Prompt für sparsame Subagenten

Diesen Prompt als Arbeitsauftrag verwenden. Die Modellnamen entsprechen den
in dieser Sitzung verfügbaren Modellen; bei späterer Nutzung Verfügbarkeit prüfen.

```text
Setze die autorisierte Aufgabe vollständig um und arbeite sparsam mit Subagenten.

Standard für neue, klar abgegrenzte Teilaufgaben: gpt-6-luna mit reasoning_effort
low. Übergebe nur den benötigten Kontext; bei spawn_agent fork_turns="none"
verwenden. Prüfe, dass Rolle oder geerbte Einstellungen das Modell nicht
überschreiben. Keine globalen Einstellungen verändern.

Zerlege Arbeit in kleine Pakete mit konkretem Ergebnis. Delegiere nur, wenn das
Paket unabhängig bearbeitbar ist. Höchstens zwei Subagenten gleichzeitig; keine
weitere Unterdelegation. Keine doppelten Vollanalysen des Projekts.

Jeder Auftrag enthält:
- Ziel und vorhandene fachliche Verträge.
- Absoluten Arbeitsordner, Branch und ausschließlich erlaubte Dateien.
- Relevante Einstiegspunkte und benötigte Schnittstellen.
- Prüffälle, Abschlusskriterien und erwartete Rückgabe.
- Hinweis: Du bist nicht allein im Projekt. Fremde Änderungen erhalten und
  berücksichtigen. Keine Veröffentlichung, kein Push, keine Produktivdaten.

Schreibende Agenten arbeiten in getrennten Worktrees. Tests vor Implementierung;
passende Prüfungen und mindestens die projektseitig geforderte Abdeckung.
Lesende Aufgaben und kleine Dokumentationsänderungen kurz halten. Rückgabe:
geänderte Dateien, Testergebnis, offene Risiken und gegebenenfalls Commit-ID.

Bei widersprüchlichen Anforderungen, fehlenden Schnittstellen oder nach zwei
erfolglosen Lösungsversuchen: konkrete Befunde melden und die betroffene Arbeit
pausieren. Der Hauptagent klärt oder stuft gezielt auf gpt-6-sol / medium hoch.
Keine stille Hochstufung und keine endlosen Reparaturschleifen.

Der Hauptagent verantwortet Integration und prüft besonders Migrationen,
Abrechnungslogik, Berechtigungen und Datenverlust-Risiken. Ein kleines Modell
ersetzt keine fachliche Prüfung. Bestehende Tests und Sicherheitsregeln gelten
unverändert. Berichte ehrlich über noch nicht bestandene Prüfungen.
```

Referenz für getrennte Agentenkontexte und rollenbezogene Einstellungen:
[OpenAI: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
Die konkrete Modellwahl oben ist eine Projektvorgabe, keine Preiszusage.
