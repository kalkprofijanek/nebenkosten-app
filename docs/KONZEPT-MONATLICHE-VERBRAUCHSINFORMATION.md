# Konzept: Monatliche Verbrauchsinformation (§ 6a Abs. 1 und 2 HeizKV)

Stand: 10. Oktober 2026. Status: **Entscheidungsvorlage, nicht umgesetzt.**
Auftrag des Nutzers: nur Konzept, nicht bauen.

## 1. Rechtslage (Wortlaut geprüft am 10.10.2026, gesetze-im-internet.de)

- **§ 6a Abs. 1 Nr. 2 HeizKV:** Wenn fernablesbare Ausstattungen zur
  Verbrauchserfassung installiert wurden, hat der Gebäudeeigentümer den
  Nutzern Abrechnungs- oder Verbrauchsinformationen für Heizung und
  Warmwasser „ab dem 1. Januar 2022 monatlich“ mitzuteilen.
- **§ 6a Abs. 2:** Mindestinhalt
  1. Verbrauch des Nutzers im letzten Monat **in Kilowattstunden**,
  2. Vergleich mit dem **Vormonat** und dem **entsprechenden Monat des
     Vorjahres** desselben Nutzers, „soweit diese Daten erhoben worden sind“,
  3. Vergleich mit einem **normierten oder durch Vergleichstests ermittelten
     Durchschnittsnutzer** derselben Nutzerkategorie.
- **§ 5 Abs. 2:** Nach dem 1.12.2021 installierte Erfassungsgeräte müssen
  fernablesbar sein. **§ 5 Abs. 3:** Ältere, nicht fernablesbare Geräte sind
  bis **31.12.2026** nachzurüsten oder zu ersetzen (Ausnahme: technisch
  unmöglich oder unbillige Härte im Einzelfall).
- **§ 12 Abs. 1:** Kürzungsrecht des Mieters um **3 %**, wenn entgegen § 5
  Abs. 2/3 keine fernablesbare Ausstattung installiert ist (Satz 2), und
  **dasselbe**, wenn die Informationen nach § 6a nicht oder nicht vollständig
  mitgeteilt werden (Satz 3). Beide Kürzungen können nebeneinander greifen.
- Eine **Form** für die Mitteilung schreibt die Verordnung nicht vor. In der
  Praxis: E-Mail, Portal oder App des Messdienstes. Beweislast für die
  Mitteilung trägt im Streit der Vermieter.

## 2. Befunde zum Stand der App

1. **Fehlerhafte Annahme „ab 2027“.** Das Regelverzeichnis
   (`packages/validators/src/legal-rules.ts`, Regel `remote-reading`, gültig
   ab 01.01.2027) und die README verknüpfen die Monatsinformation mit der
   Nachrüstfrist. Richtig ist: Die Pflicht besteht **seit 2022 für jedes
   Objekt, in dem fernablesbare Geräte eingebaut sind**; 2027 ist nur der
   Zeitpunkt, ab dem alle Objekte betroffen sind. → **Sofortkorrektur**
   (Entscheidung E0).
2. Die App kennt **keine Geräteebene für Heizkostenverteiler**: HKV-Einheiten
   stehen als Jahreswert an der Nutzung (`OccupancyPeriod.consumptionUnits`).
   Zähler (`Meter`) gibt es für Wärmemengen (`unit_heat`), ohne Merkmal
   „fernablesbar“.
3. Bausteine sind vorhanden: Gradtagszahlen (ADR-0007), Vergleichswerte
   Heizspiegel (ADR-0004), Messdienst-CSV-Parser ohne Speicherung
   (Codex-PR #74), Energieeinsatz in kWh je Heizkreis (Core).

## 3. Kernfrage: Wer erstellt die Monatsinformation?

Fernablesbare Geräte werden fast immer von einem Messdienst (ista, Techem,
Brunata, Minol, Kalo u. a.) betrieben. Diese bieten die Monatsinformation
regelmäßig als Portal/App-Leistung an, oft gegen Entgelt (dann umlagefähig
als Kosten der Verbrauchserfassung, prüfen).

| Option | Inhalt | Aufwand App | Laufender Aufwand Vermieter | Risiko |
|---|---|---|---|---|
| **A – Messdienst liefert, App dokumentiert** | Je Objekt erfassen: fernablesbar ja/nein seit wann, Anbieter der Monatsinformation, Kanal, Beginn; Prüfhinweise; Hinweis in der Jahresabrechnung | gering (Schema + Prüfung + Maske) | gering: einmal je Objekt einrichten, Messdienst-Nachweis ablegen | Inhalt liegt beim Messdienst; Vermieter muss Vollständigkeit (Abs. 2 Nr. 1–3) einmal prüfen |
| **B – App erstellt selbst** | Monatswerte importieren, kWh umrechnen, Vergleiche bilden, PDF je Mieter erzeugen, Versand protokollieren | hoch (Import je Messdienstformat, Rechenkern, PDF, Versandlog) | hoch: **jeden Monat** Import, Prüfung, Versand an alle Mieter | Fehler in der kWh-Umrechnung; Versandnachweis; Pflege der Formate |
| **C – Hybrid** | A als Standard; B nur für Objekte ohne Portal des Messdienstes | mittel bis hoch | je Objekt verschieden | wie B für die Ausnahmeobjekte |

**Empfehlung: Option A.** Begründung:

- Wirtschaftlich: B erzeugt einen dauerhaften Monatsprozess, den der
  Messdienst ohnehin automatisiert hat; die Daten liegen dort zuerst vor.
- Rechtlich: Die Pflicht trifft den Eigentümer, die Durchführung kann er
  übertragen. Entscheidend ist der **Nachweis**, dass die Information
  vollständig und monatlich erteilt wird – das kann die App dokumentieren.
- Technisch: B hängt an proprietären Exportformaten (Codex-PR #74 bestätigt
  ausdrücklich keine Kompatibilität mit Techem/ista) und an einer
  kWh-Umrechnung für HKV, die fachlich angreifbar ist (Abschnitt 4).
- B bleibt als späterer Ausbau offen (Option C), falls ein Objekt ohne
  Portal betrieben wird.

## 4. Fachliche Probleme, falls B oder C gewählt wird

1. **kWh bei Heizkostenverteilern.** HKV-Einheiten sind dimensionslos. Die
   Umrechnung in kWh setzt einen Faktor voraus (kWh je Einheit), der erst mit
   dem Energieeinsatz des Jahres feststeht. Unterjährig nur mit Vorjahres-
   oder Planfaktor möglich; Abweichungen sind unvermeidlich und müssen im
   Infoblatt benannt werden. Wärmemengenzähler liefern kWh direkt.
2. **Warmwasser.** Abs. 1 nennt Heizung **und** Warmwasser. Ohne
   Warmwasserzähler mit Fernablesung ist der Monatsanteil nur geschätzt
   (z. B. Jahresanteil ÷ 12) – als solcher kennzeichnen.
3. **Durchschnittsnutzer monatlich.** Heizspiegel liefert Jahreswerte.
   Monatswert = Jahreswert × Gradtagsanteil des Monats (ADR-0007) für
   Heizwärme, Warmwasser gleichmäßig ÷ 12. Quelle und Verfahren angeben.
4. **Vormonat / Vorjahresmonat:** nur „soweit erhoben“ – fehlende Werte sind
   kein Verstoß, müssen aber als „nicht erhoben“ ausgewiesen werden.
5. **Mieterwechsel im Monat:** Monatswert anteilig nach Tagen bzw.
   Ablesung zum Stichtag; Vergleich mit Vormonat desselben **Nutzers**.
6. **Versandnachweis:** Datum, Kanal, Empfänger je Monat und Nutzung;
   Aufbewahrung bis Ablauf der Einwendungsfrist der Jahresabrechnung.
7. **Datenschutz:** Monatswerte sind personenbezogene Verbrauchsdaten; im
   Repository nur fiktive Fixtures (AGENTS.md Regel 5).

## 5. Skizze für Option A (nur zur Entscheidung, nicht gebaut)

- **Schema (additiv):** am Objekt bzw. Heizkreis
  `remoteReading: { status: 'none' | 'partial' | 'complete', since?: date,
  exemptionReason?: string }` und
  `monthlyInformation: { provider: string, channel: 'portal' | 'app' |
  'email' | 'letter', since: date, coversHotWater: boolean, evidence?:
  attachment }`.
- **Prüfung je Abrechnungsjahr:**
  - fernablesbar, aber keine Monatsinformation hinterlegt → **Fehler**
    (Kürzung 3 % nach § 12 Abs. 1 Satz 3),
  - Monatsinformation erst ab Monat X → Warnung für die Monate davor,
  - Abrechnungsjahr ab 2027 und nicht fernablesbar ohne begründete Ausnahme
    → **Fehler** (Kürzung 3 % nach § 12 Abs. 1 Satz 2),
  - `coversHotWater: false` bei zentralem Warmwasser → Warnung.
- **Einzelabrechnung:** Satz „Monatliche Verbrauchsinformationen erhalten Sie
  über … (seit …)“ im § 6a-Block.
- **Aufwand grob:** Schema/Core/Prüfung 1 PR (Claude), Maske/PDF-Satz 1 PR
  (Codex).

## 6. Entscheidungen des Nutzers

| Nr. | Frage | Vorschlag |
|---|---|---|
| E0 | Regeltext `remote-reading` sofort korrigieren (Pflicht seit 2022 bei vorhandener Fernablesung; 2027 nur Nachrüstfrist)? | **Ja**, kleiner eigener PR |
| E1 | Option A, B oder C? | **A** |
| E2 | Bestandsaufnahme: Welche Objekte haben heute fernablesbare Geräte, welcher Messdienst, gibt es ein Mieterportal/App? | vom Nutzer zu liefern; bestimmt, ob die Pflicht **bereits jetzt** läuft |
| E3 | Werden Entgelte für die Monatsinformation umgelegt? | rechtlich prüfen lassen; Kennzeichnung als Messdienstentgelt (ADR-0006) möglich |
| E4 | Ausnahme nach § 5 Abs. 3 Satz 2 (technisch unmöglich / unbillige Härte) für einzelne Objekte? | nur mit schriftlicher Begründung erfassen |

## 7. Priorität und nächste Schritte

1. **E2 sofort klären** (Nutzer): Laufen in einem Objekt bereits
   fernablesbare Geräte ohne Monatsinformation, besteht das Kürzungsrisiko
   **heute** und rückwirkend für die betroffenen Abrechnungsjahre.
2. E0 umsetzen (klein, risikolos).
3. Nach E1: Option A als Schema/Prüfung (Claude) und Maske/PDF-Satz (Codex).
