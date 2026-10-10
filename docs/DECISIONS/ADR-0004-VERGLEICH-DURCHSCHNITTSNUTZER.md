# ADR-0004: Vergleich mit dem normierten Durchschnittsnutzer (Heizspiegel)

- Status: angenommen (Schema, Rechenvertrag, Prüfung); Ausgabe in PDF und
  Oberfläche folgt (`docs/TASKS/PR-24-VERGLEICH-DURCHSCHNITTSNUTZER.md`)
- Datum: 2026-10-10
- Entscheidungen des Nutzers (10. Oktober 2026): Vergleichswerte aus dem
  Heizspiegel für Deutschland (co2online); Gradtagszahlen des Deutschen
  Wetterdienstes werden später manuell importiert (eigener ADR)

## Kontext

§ 6a Abs. 3 Nr. 4 HeizKV verlangt in der Abrechnung einen Vergleich des
Nutzerverbrauchs mit dem eines normierten oder durch Vergleichstests
ermittelten Durchschnittsnutzers derselben Nutzerkategorie. Fehlt er, darf
der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 12 Abs. 1 HeizKV). Bisher
weist die Einzelabrechnung nur den Mittelwert des eigenen Heizkreises aus
und die Prüfung meldet `heating.consumption_benchmark_missing`.

Der Heizspiegel weist je Energieträger (Erdgas, Heizöl, Fernwärme,
Wärmepumpe) und Gebäudekategorie (Baualtersklasse) Klassengrenzen in kWh je
m² Wohnfläche und Jahr aus („niedrig“, „mittel“, „erhöht“, „zu hoch“). Die
Werte beziehen sich auf den Energieeinsatz des ganzen Gebäudes und enthalten
Raumwärme **und** Warmwasser.

## Entscheidung

1. **Schnittstelle (additiv):** `HeatingCircuit.consumptionBenchmark`
   (`consumptionBenchmarkSchema`, optional). Quelle, Kategorie, Bezugsjahr,
   `includesHotWater` und drei aufsteigende Klassengrenzen werden aus der
   Quelle übernommen. Die App enthält **keine** Heizspiegel-Werte, weil sie
   jährlich neu erscheinen und je Gebäude anders zu wählen sind. Die
   Schema-Version bleibt 5 (wie ADR-0003).
2. **Rechenvertrag** (`compareTenantWithConsumptionBenchmark`,
   `packages/core/src/heating/consumption-benchmark.ts`):
   - Heizwärme des Nutzers = Energieeinsatz des Heizkreises (kWh) ×
     (1 − Warmwasseranteil) × eigener Verbrauch ÷ Verbrauch aller Nutzungen
     einschließlich Leerstand – derselbe Schlüssel wie bei den
     Verbrauchskosten. Das gilt auch für Wärmemengenzähler, damit Nutzer und
     Vergleichswert auf derselben Stufe (Energieeinsatz) stehen.
   - Warmwasser des Nutzers (nur wenn `includesHotWater`) = Energieeinsatz ×
     Warmwasseranteil × eigene Personenzeit ÷ Personenzeit aller Nutzer –
     derselbe Schlüssel wie bei den Warmwasserkosten.
   - Bezug je m²: Fläche des Grundkostenschlüssels; kürzere Nutzung wird
     linear auf ein Jahr hochgerechnet (`annualized`). Ergebnis auf eine
     Nachkommastelle; die Einstufung erfolgt auf diesem Wert, eine
     Klassengrenze gehört zur unteren Klasse.
   - Kein Vergleich (`status: 'unavailable'` mit Grund) bei Leerstand,
     unbekanntem Energieeinsatz, fehlendem Verbrauch oder fehlender Fläche
     sowie bei Vergleichswerten mit Warmwasser, wenn das Warmwasser nicht
     zentral über den Heizkreis bereitet wird.
3. **Prüfung:** `heating.consumption_benchmark_not_comparable` (Warnung, je
   Heizkreis und Grund) und `heating.consumption_benchmark_year_mismatch`
   (Hinweis, wenn das Bezugsjahr vom Abrechnungsjahr abweicht).
   `heating.consumption_benchmark_missing` bleibt unverändert, bis die
   Einzelabrechnung den Vergleich ausgibt; sonst würde die Prüfung einen
   Vergleich bestätigen, den der Mieter nicht erhält.

## Offene Entscheidungen

- **Rechtliche Tragfähigkeit:** Ob die Einstufung in Heizspiegel-Klassen den
  „normierten Durchschnittsnutzer derselben Nutzerkategorie“ erfüllt, ist
  nicht höchstrichterlich geklärt. Verbreitete Praxis der Messdienste ist ein
  Vergleich mit Kennwerten nach Gebäudekategorie; der Heizspiegel ist als
  Quelle nachvollziehbar und öffentlich.
- **Hochrechnung bei Teilzeitraum:** Mit Nutzungszeitraum wird die
  Heizwärme nach Gradtagszahlen (VDI 2067), das Warmwasser nach Tagen
  hochgerechnet; ohne Nutzungszeitraum linear (ADR-0007, 10. Oktober 2026).
- **Dezentrales Warmwasser:** Heizspiegel-Werte enthalten Warmwasser. Ohne
  zentrale Bereitung ist der Vergleich nur mit Werten ohne Warmwasser
  möglich (`includesHotWater: false`); woher diese stammen, ist offen.
- **Kaltwasser in den Heizkosten** ist ohne Einfluss, weil der Vergleich auf
  kWh und nicht auf Kosten beruht.

## Tests

- `packages/schema/tests/consumption-benchmark.test.ts`: optional,
  abwärtskompatibel, strikt, aufsteigende Grenzen, URL-Schema.
- `packages/core/tests/consumption-benchmark.test.ts`: Handrechnung mit
  Warmwasser, Teilzeitraum, ohne Warmwasser, alle Gründe ohne Vergleich,
  Klassengrenzen.
- `packages/validators/tests/consumption-benchmark.test.ts`: Prüfhinweise.
- `apps/web/src/features/heating/heating-commands.test.tsx`: Vergleichswerte
  bleiben beim Bearbeiten des Heizkreises erhalten.

## Migrationsauswirkungen

- Bestehende Dateien bleiben gültig; es ist keine Migration nötig.
- Eine Datei mit Vergleichswerten kann von App-Versionen ohne dieses Feld
  nicht mehr geöffnet werden (strikte Schemaprüfung). Das betrifft nur
  Nutzer, die zu einer älteren Version zurückkehren.
- Legacy-v3 kennt keine Vergleichswerte; der Import setzt das Feld nicht.
