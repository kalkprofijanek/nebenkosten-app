# Arbeiten mit Claude oder ChatGPT

Diese Anleitung beschreibt, wie Sie eine KI (Claude, ChatGPT o. Ä.) bei der
Nebenkostenabrechnung einsetzen, **ohne** die Rechenlogik der App aus der
Hand zu geben.

## Grundprinzip

| Aufgabe                                          | Wer                                                             |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Rechnungen lesen, Beträge und Zeiträume auslesen | KI (Vorschlag)                                                  |
| Bankbuchungen vorkontieren, Rechnungen zuordnen  | KI (Vorschlag)                                                  |
| Umlagefähigkeit beurteilen                       | KI-Vorschlag, **Mensch entscheidet**                            |
| Erfassen / Korrigieren                           | KI-Agent per Skript auf Sicherungskopie, oder Mensch in der App |
| Unplausible Werte (Zählerstände, Bestände)       | **Mensch entscheidet** nach Vorlage der KI                      |
| Rechnen, Verteilen, Runden, Heizkosten, CO₂      | **ausschließlich die Fachlogik** (App bzw. `pnpm abrechnung`)   |
| Freigabe und Versand                             | **ausschließlich der Mensch**                                   |

Die Browser-App hat bewusst **keine Schnittstelle nach außen**
(Content Security Policy `connect-src 'none'`). Eine KI im Chat kann deshalb
nicht direkt in Ihre Daten schreiben. Ein **KI-Coding-Agent** auf Ihrem
Rechner (Ablauf 0) arbeitet dagegen auf einer lokalen Kopie und rechnet mit
derselben Fachlogik ohne Browser.

## Ablauf 0 (empfohlen): KI-Coding-Agent mit lokaler Kopie

So wurde u. a. eine Abrechnung mit rund 65 Mietparteien, vier Heizkreisen
und Eigentümerwechsel erstellt:

1. Repository klonen, `pnpm install`. Datendatei (Sicherung aus der App oder
   `nk-daten.json`) nach `private-data/` legen – dieser Ordner wird nie
   committet.
2. Den Agenten (z. B. **Claude Code**) die Belege lesen lassen: Rechnungen,
   Kontoauszüge, Ablesebögen, Fotos, Mails. Für jeden übernommenen Wert nennt
   er die Quelle.
   Liegen die Rechnungen in einem Ordner je Objekt, ordnen Sie ihn einmal in
   `private-data/objekt-ordner.json` zu (siehe
   [`BELEGPRUEFUNG.md`](BELEGPRUEFUNG.md)). Der Agent liest nur die Ordner,
   die Sie freigeben, bestimmt das Abrechnungsjahr aus dem
   **Leistungszeitraum** (nicht aus Rechnungsdatum oder Ordner) und trägt den
   Dateinamen als Belegnummer ein. `pnpm belegpruefung … --jahr 2025` zeigt
   danach Kosten ohne Rechnung und Rechnungen ohne Kostenposition.
3. **Vor jeder Änderung eine Sicherungskopie**; Änderungen als kleines Skript
   mit Kommentar (was, warum, welcher Beleg), damit sie nachvollziehbar und
   wiederholbar sind. Keine Handänderung ohne Beleg.
4. Unplausibles nicht „glattrechnen“: z. B. Zählerstände, die kleiner werden,
   Verbräuche weit über Vorjahr, Bestände ohne Lieferung. Der Agent legt die
   Fälle mit Optionen und Empfehlung zur Entscheidung vor.
5. Rechnen und prüfen:
   `pnpm abrechnung private-data/nk-daten.json --jahr 2025 --out private-data/pdf`
   – Kontrolldifferenz, Heizkreise (25-%-Grenze § 9a Abs. 2 HeizKV),
   Salden, Prüfhinweise und alle PDFs. Die PDFs gemeinsam durchsehen.
   Felder, die der Legacy-v3-Import nicht kennt (z. B. § 9b-Aufteilung
   `section9bAllocation`, Steuern und Abgaben `taxesAndLevies`,
   Klimafaktoren, Warmwasserfelder), setzt ein Overlay-Modul außerhalb des
   Repositorys: `--overlay private-data/overlay.mjs` mit
   `export default function (data, { year }) { … }`. Das Ergebnis wird erneut
   gegen das Dateischema geprüft; die Eingabedatei bleibt unverändert.
   Mit `--abrechnungsentgelt 40 [--ust 19]` zeigt die Ausgabe zusätzlich das
   Entgelt für die Erstellung der Heiz-/Warmwasserkostenabrechnung
   (ADR-0015): Kalkulationshilfe je erstellter Heizkostenabrechnung (je
   bewohnte Nutzung eine, Nutzerwechsel zwei, Leerstand keine) gegen die
   erfasste Rechnung, Aufteilung Heizung/Warmwasser und Mehrbelastung je
   Nutzung.
6. **Referenzwerte selbst abrufen:** Klimafaktor je Postleitzahl (DWD),
   Vergleichswerte (Heizspiegel), CO₂-Preis und Rechtsgrundlagen holt der
   Agent selbst aus den Quellen in [`DATENQUELLEN.md`](DATENQUELLEN.md) – mit
   URL bzw. Dateiname und Abrufdatum je Wert – und legt sie zur Bestätigung
   vor. Die App selbst lädt nichts aus dem Netz.
7. Zum Abschluss die Datei in der App importieren, Prüfhinweise bestätigen,
   freigeben und versenden.

Bewährt hat sich, den Agenten am Ende jeder Sitzung eine **Übergabe-Notiz**
(Stand, Entscheidungen, offene Punkte) neben die Daten schreiben zu lassen.

## Datenschutz – vor dem ersten Einsatz klären

Rechnungen und Kontoauszüge enthalten personenbezogene Daten Ihrer Mieter
(Namen, Zahlungen, ggf. Verbräuche). Wer sie an einen KI-Dienst gibt,
verarbeitet sie im Sinne der DSGVO **als Verantwortlicher**.

- Nutzen Sie einen **Business-/Team-Tarif**, bei dem Eingaben nicht zum
  Training verwendet werden, und schließen Sie mit dem Anbieter einen
  **Auftragsverarbeitungsvertrag (Art. 28 DSGVO)** ab.
- Geben Sie nur, was nötig ist: Für Rechnungen von Versorgern, Versicherern
  und Handwerkern sind Mieternamen meist gar nicht enthalten. Schwärzen Sie
  Kontoauszüge bei Bedarf (Mietereingänge) oder lassen Sie diese Zeilen weg.
- Geben Sie **niemals** die vollständige JSON-Sicherung an eine KI, wenn eine
  Teilinformation reicht.
- Regeln für lokale Agenten, Ordnerverknüpfung und eine Checkliste stehen
  in [`DATENSCHUTZ-KI.md`](DATENSCHUTZ-KI.md).
- Dies ist keine Rechtsberatung. Klären Sie die Anforderungen für Ihren Fall.

## Ablauf A: Eingangsrechnungen auslesen

1. Legen Sie in einem Claude-Projekt bzw. einem eigenen GPT die
   **Arbeitsanweisung** unten als Projektanweisung ab.
2. Laden Sie die Rechnungen des Abrechnungsjahres (PDF/Foto) hoch.
3. Die KI liefert eine **Erfassungsliste** im festen Format (siehe unten),
   inklusive Rückfragen zu unklaren Positionen.
4. Prüfen Sie die Liste, klären Sie die Rückfragen.
5. Importieren Sie die Erfassungsliste unter **Kosten → Kostenpositionen →
   KI-Erfassungsliste importieren**, prüfen Sie die Vorschau und übernehmen
   Sie die Positionen. Alternativ erfassen Sie jede Zeile manuell unter
   **Kosten → Kostenpositionen**
   (Kostenart, Belegdatum, Beschreibung, Belegnummer, Betrag, umlagefähiger
   Anteil). Die übrigen Spalten dienen Ihrer Prüfung: Der Leistungszeitraum
   entscheidet über das Abrechnungsjahr, der Lohnanteil in Euro hilft, den
   Lohnanteil in Prozent an der Kostenart (§ 35a EStG) zu pflegen.

   Für den Import müssen Kostenarten eindeutig über ihren Namen zugeordnet
   werden können und Rückfragen geklärt sein. Leistungszeiträume außerhalb des
   gewählten Jahres müssen vorher aufgeteilt werden. Der Lohnanteil wird gegen
   den Prozentsatz der Kostenart geprüft; bei abweichenden Belegen verwenden
   Sie getrennte Kostenarten oder erfassen sie nach fachlicher Prüfung manuell.
   Lieferant, Leistungszeitraum, Begründung und Lohnbetrag bleiben zusätzlich
   in der Belegbeschreibung erhalten. Die Vorschau speichert noch nichts.
   Mögliche Duplikate blockieren die Übernahme; alle Zeilen werden gemeinsam
   übernommen. Ein Zahlungsnachweis wird dadurch nicht erzeugt.

## Ablauf B: Bankbuchungen

1. Exportieren Sie den Kontoauszug als CSV aus dem Online-Banking.
2. Passt das Format nicht (siehe [`BANK-CSV-FORMAT.md`](BANK-CSV-FORMAT.md)),
   kann die KI die Datei in das kompatible Format umbauen:
   _„Wandle diese CSV in das Format Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Buchungstext;Betrag um, Datum TT.MM.JJJJ, Betrag mit Komma, Ausgaben negativ. Lass keine Zeile weg und erfinde keine.“_
   Prüfen Sie danach Anzahl der Zeilen und Summe gegen den Originalauszug.
3. Importieren Sie die CSV unter **Kosten → Bankbuchungen**.
4. Lassen Sie die KI anhand derselben CSV und der Erfassungsliste aus
   Ablauf A eine **Vorkontierung** erstellen: Kategorie je Buchung
   (Umlagefähig, Nicht umlagefähig, Mieteingang, Kaution, Instandhaltung,
   Verwaltung, Sonstige), Abrechnungsjahr, Kostenart und zugehörige
   Rechnung.
5. Übernehmen Sie die Zuordnung in der App und verknüpfen Sie die
   Kostenpositionen unter „Zahlungsnachweis“ mit der Bankbuchung.

## Ablauf C: Plausibilitätsprüfung

Nach **Berechnung** können Sie die Gesamtabrechnung (PDF) und die
Erfassungsliste der KI geben und gezielt fragen lassen:

- Fehlen Kostenarten gegenüber dem Vorjahr?
- Weichen Kosten je m² stark vom Vorjahr ab?
- Sind alle Rechnungen mit Leistungszeitraum im Abrechnungsjahr erfasst?
- Stimmen Vorauszahlungen mit den Mieteingängen überein?

Die Prüfhinweise der App haben Vorrang. Die KI ergänzt, sie ersetzt sie nicht.

## Browser-Agenten (Claude in Chrome, ChatGPT Agent)

Ein Browser-Agent kann die App wie ein Mensch bedienen und die
Erfassungsliste eintragen. Das ist möglich, aber:

- Lassen Sie ihn **nur erfassen, nie freigeben**.
- Erstellen Sie vorher eine JSON-Sicherung.
- Kontrollieren Sie danach die Summe der Kostenpositionen gegen die
  Erfassungsliste.

Eine KI im **Chat** sollte die JSON-Sicherung nicht frei bearbeiten und
zurückspielen: Der Import prüft zwar das Dateischema, erkennt aber keine
fachlich falschen, formal gültigen Werte. Wenn Daten direkt geändert werden,
dann nur nach Ablauf 0 (Sicherung, Skript, Beleg, Prüflauf mit
`pnpm abrechnung`).

## Erfassungsliste (Austauschformat)

CSV mit Semikolon, eine Zeile je Rechnung bzw. je Rechnungsposition, wenn
eine Rechnung mehrere Kostenarten betrifft:

```csv
Kostenart;Belegdatum;Leistung von;Leistung bis;Beschreibung;Belegnummer;Betrag brutto EUR;Umlagefaehig Prozent;Lohnanteil EUR;Lieferant;Begruendung;Rueckfrage
Gebäudereinigung;20.01.2025;01.01.2025;31.01.2025;Treppenhausreinigung Januar;RE-2025-001;95,20;100;80,00;Muster Gebaeudereinigung;§ 2 Nr. 9 BetrKV;
Heizung;18.06.2025;18.06.2025;18.06.2025;Wartung Heizungsanlage;RE-0815;289,00;100;180,00;Muster Heizungsbau;§ 2 Nr. 4 BetrKV;
Instandhaltung;30.06.2025;30.06.2025;30.06.2025;Austausch Umwälzpumpe;RE-0816;640,50;0;;Muster Heizungsbau;Reparatur, nicht umlagefähig;
```

## Auftrag für den KI-Agenten (Copy & Paste)

Für Ablauf 0 mit Claude Code o. Ä. Die App bietet den Text unter
**Übersicht → Mit KI arbeiten** zum Kopieren an und setzt das gewählte
Abrechnungsjahr ein; `<DATEI>` ist der Name Ihrer Sicherung.

```text
Du arbeitest im Repository nebenkosten-app und bereitest die Betriebs- und
Heizkostenabrechnung für das Abrechnungsjahr <JAHR> vor. Lies zuerst
AGENTS.md, docs/KI-ANLEITUNG.md und docs/DATENQUELLEN.md.

Meine Datendatei (Sicherung aus der App) und die Belege liegen in
private-data/. Dieser Ordner wird nie committet; echte Daten verlassen den
Rechner nicht.

So gehst du vor:
1. Lege vor jeder Änderung eine Sicherungskopie an. Änderungen schreibst du
   als kleines Skript mit Kommentar (was, warum, welcher Beleg).
2. Lies Rechnungen, Kontoauszüge und Ablesebögen aus und nenne für jeden
   Wert die Quelle. Erfinde keine Werte.
3. Referenzwerte (Klimafaktor des DWD je Postleitzahl, Heizspiegel-
   Vergleichswerte, CO₂-Preis) rufst du selbst aus der Originalquelle ab,
   mit URL bzw. Dateiname und Abrufdatum.
4. Unplausibles (z. B. rückläufige Zählerstände, Abschläge statt Rechnung,
   Preissprünge, mehr als 25 % geschätzte Fläche) legst du mir mit Optionen
   und Empfehlung zur Entscheidung vor, statt es glattzurechnen.
5. Rechne und prüfe mit
   pnpm abrechnung private-data/<DATEI>.json --jahr <JAHR> --out private-data/pdf
   und fasse Kontrolldifferenz, Prüfhinweise, Energiebilanz und Salden
   zusammen.
6. Schreibe am Ende eine Übergabe-Notiz (Stand, Entscheidungen, offene
   Punkte) nach private-data/.
```

## Arbeitsanweisung für die KI (Copy & Paste)

Auch diese Anweisung lässt sich unter **Übersicht → Mit KI arbeiten** kopieren.

```text
Du unterstützt bei der Vorbereitung einer Betriebs- und Heizkostenabrechnung
für Wohnraum nach § 556 BGB, BetrKV und HeizKV. Die Abrechnung selbst
berechnet eine separate App. Deine Aufgabe ist ausschließlich das Auslesen,
Zuordnen und Prüfen.

Regeln:
1. Erfinde keine Werte. Was auf dem Beleg nicht eindeutig steht, bleibt leer
   und wird in der Spalte "Rueckfrage" benannt.
2. Gib Beträge brutto in Euro mit Komma und zwei Nachkommastellen an.
3. Maßgeblich ist der Leistungszeitraum, nicht das Rechnungsdatum. Betrifft
   eine Rechnung zwei Abrechnungsjahre, teile sie zeitanteilig auf und weise
   die Aufteilung aus.
4. Ordne jede Position einer Betriebskostenart nach § 2 Nr. 1–17 BetrKV zu
   und nenne die Nummer in "Begruendung". Nicht umlagefähig sind insbesondere
   Instandhaltung/Reparatur, Verwaltung, Bankgebühren, Rücklagen,
   Neuanschaffungen. Kabel-TV-Entgelte sind seit 1. Juli 2024 grundsätzlich
   nicht mehr umlagefähig.
5. Enthält eine Rechnung umlagefähige und nicht umlagefähige Teile (z. B.
   Wartung plus Reparatur), trenne sie in zwei Zeilen.
6. Weise Lohnanteile (Arbeits- und Fahrtkosten ohne Material) getrennt aus,
   wenn sie auf dem Beleg erkennbar sind.
7. Brennstofflieferungen (Heizöl, Flüssiggas, Pellets) gesondert mit Menge,
   Einheit und Lieferdatum auflisten; sie werden in der App nicht als
   Kostenposition, sondern als Lieferung erfasst.
8. Bei Bankbuchungen ordnest du zu: Kategorie (Umlagefähig, Nicht
   umlagefähig, Mieteingang, Kaution, Instandhaltung, Verwaltung, Sonstige),
   Abrechnungsjahr, Kostenart und Belegnummer der passenden Rechnung.
   Unsichere Zuordnungen markierst du als "Rueckfrage", du rätst nicht.
9. Gib das Ergebnis als CSV im vorgegebenen Format der Erfassungsliste aus,
   danach eine nummerierte Liste aller Rückfragen und eine Kontrollsumme
   (Summe brutto, Summe umlagefähig).
10. Du gibst keine abschließende Rechtsauskunft. Weise auf Punkte hin, die
    der Abrechnende rechtlich prüfen sollte.
11. Referenzwerte (Klimafaktor des DWD je Postleitzahl, Heizspiegel-
    Vergleichswerte, CO₂-Preis) rufst du selbst aus der Originalquelle ab
    (docs/DATENQUELLEN.md). Gib für jeden Wert URL bzw. Dateiname und
    Abrufdatum an. Findest du den Wert nicht eindeutig, schätze ihn nicht,
    sondern benenne ihn als "Rueckfrage".
```
