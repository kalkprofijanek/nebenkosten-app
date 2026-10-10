# ADR-0009: Zwischenablesung bei Nutzerwechsel

- Status: angenommen (Core, Prüfhinweis); Hinweis bei der Erfassung des
  Wechsels folgt (`docs/TASKS/PR-29-ZWISCHENABLESUNG.md`)
- Datum: 2026-10-10
- Entscheidung des Nutzers (10. Oktober 2026): Warnung gewünscht, aber eine
  Prüfung zur Jahresabrechnung „kommt zu spät“ – die Ablesung lässt sich
  nicht nachholen.

## Rechtslage (Wortlaut geprüft am 10.10.2026)

§ 9b Abs. 1 HeizKV: Bei Nutzerwechsel innerhalb eines Abrechnungszeitraums
**hat** der Gebäudeeigentümer eine Zwischenablesung der betroffenen Räume
vorzunehmen. Abs. 2: Die verbrauchsabhängigen Kosten werden nach der
Zwischenablesung, die übrigen Wärmekosten nach Gradtagszahlen oder
zeitanteilig, Warmwasser-Grundkosten zeitanteilig aufgeteilt. Abs. 3: Nur
wenn die Zwischenablesung nicht möglich ist oder wegen des Zeitpunkts keine
hinreichend genaue Ermittlung zulässt, werden die gesamten Kosten nach
Gradtagszahlen bzw. zeitanteilig aufgeteilt. Abs. 4: Abweichende
Vereinbarungen bleiben unberührt.

**Folge für ADR-0007:** Die Aufteilung nach Gradtagszahlen
(`splitByDegreeDays`) ist der Ausweg nach Abs. 3, nicht der Regelfall.

## Entscheidung

1. **Hinweis zum richtigen Zeitpunkt:** Der wirksame Zeitpunkt ist die
   Erfassung des Wechsels. Das Auszugsdatum steht mit der Kündigung meist
   Wochen vorher fest; wird es dann in der App eingetragen, erscheint der
   Hinweis rechtzeitig (Teil B, Codex). Eine Benachrichtigung außerhalb der
   App gibt es nicht (lokale Desktop-App).
2. **Core** (`tenantChanges` in `packages/core/src/heating/tenant-change.ts`):
   Nutzerwechsel je Wohnung im Abrechnungszeitraum, einschließlich Wechsel
   zwischen Leerstand und Mieter. Als Zwischenablesung gilt ein Endstand der
   vorigen oder ein Anfangsstand der neuen Nutzung mit Datum am Wechseltag
   oder dem Tag davor.
3. **Prüfung zur Abrechnung:** `heating.interim_reading_missing` als
   **Hinweis** (nicht Warnung): Messdienste lesen oft selbst zwischen ab und
   melden nur Einheiten je Nutzer, ohne dass Stände in der App stehen. Eine
   Warnung würde dann bei jedem Wechsel ohne Anlass ausgelöst. Der Hinweis
   dient der Dokumentation (Stand erfassen oder Grund festhalten).

## Offene Entscheidungen

- Kennzeichen „Zwischenablesung durch Messdienst erfolgt“ ohne Stände, um den
  Hinweis gezielt abzuschalten – erst nach Erfahrung mit echten Daten.
- Hinweis bei geplantem Auszug **im Folgejahr** (Kündigung liegt vor, Jahr
  noch nicht angelegt) – setzt Erfassung von Kündigungen voraus.

## Tests

- `packages/core/tests/tenant-change.test.ts`
- `packages/validators/tests/meter-reading-validation.test.ts`

## Migrationsauswirkungen

Keine; keine Schemaänderung.
