# Sanitisierter Legacy-Referenzstand

`index.html` ist die sanitisierte GitHub-Referenz für die Migration. Sie wurde nach einem Datenschutzvorfall aus der bisherigen App abgeleitet, ist noch nicht abschließend anonymitätsgeprüft und ist nicht bytegleich mit der ausschließlich lokal aufbewahrten produktiven Original-App. Bereinigt wurden auch operative Seed- und Klassifizierungswerte; dadurch sind in diesen Bereichen Verhaltensabweichungen möglich.

Verbindliche SHA-256-Prüfsumme:

```text
874af27415add7aeea330592c3e45da78a7c3e20e46dfcb8d71abbba6d21abab
```

Ab dem bereinigten Root-Commit darf die Datei weder formatiert noch normalisiert oder fachlich verändert werden. Characterization Tests müssen zwischen dieser sanitisierten GitHub-Baseline und Vergleichstests gegen den ausschließlich lokalen produktiven Originalstand unterscheiden.
