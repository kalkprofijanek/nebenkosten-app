# Arbeiten mit Claude oder ChatGPT

Diese Anleitung beschreibt, wie Sie eine KI (Claude, ChatGPT o. Ä.) bei der
Nebenkostenabrechnung einsetzen, **ohne** die Rechenlogik der App aus der
Hand zu geben.

## Grundprinzip

| Aufgabe                                          | Wer                                        |
| ------------------------------------------------ | ------------------------------------------ |
| Rechnungen lesen, Beträge und Zeiträume auslesen | KI (Vorschlag)                             |
| Bankbuchungen vorkontieren, Rechnungen zuordnen  | KI (Vorschlag)                             |
| Umlagefähigkeit beurteilen                       | KI-Vorschlag, **Mensch entscheidet**       |
| Erfassen in der App                              | Mensch (oder Browser-Agent unter Aufsicht) |
| Rechnen, Verteilen, Runden, Heizkosten, CO₂      | **ausschließlich die App**                 |
| Freigabe und Versand                             | **ausschließlich der Mensch**              |

Die App hat bewusst **keine Schnittstelle nach außen**
(Content Security Policy `connect-src 'none'`). Eine KI kann deshalb nicht
direkt in Ihre Daten schreiben. Das ist gewollt: Jede Übernahme läuft über
Sie.

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
- Dies ist keine Rechtsberatung. Klären Sie die Anforderungen für Ihren Fall.

## Ablauf A: Eingangsrechnungen auslesen

1. Legen Sie in einem Claude-Projekt bzw. einem eigenen GPT die
   **Arbeitsanweisung** unten als Projektanweisung ab.
2. Laden Sie die Rechnungen des Abrechnungsjahres (PDF/Foto) hoch.
3. Die KI liefert eine **Erfassungsliste** im festen Format (siehe unten),
   inklusive Rückfragen zu unklaren Positionen.
4. Prüfen Sie die Liste, klären Sie die Rückfragen.
5. Erfassen Sie jede Zeile in der App unter **Kosten → Kostenpositionen**
   (Kostenart, Belegdatum, Beschreibung, Belegnummer, Betrag, umlagefähiger
   Anteil). Die übrigen Spalten dienen Ihrer Prüfung: Der Leistungszeitraum
   entscheidet über das Abrechnungsjahr, der Lohnanteil in Euro hilft, den
   Lohnanteil in Prozent an der Kostenart (§ 35a EStG) zu pflegen.

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

Nicht empfohlen ist, die JSON-Sicherung von einer KI bearbeiten zu lassen und
zurückzuspielen. Der Import prüft zwar das Dateischema, erkennt aber keine
fachlich falschen, formal gültigen Werte.

## Erfassungsliste (Austauschformat)

CSV mit Semikolon, eine Zeile je Rechnung bzw. je Rechnungsposition, wenn
eine Rechnung mehrere Kostenarten betrifft:

```csv
Kostenart;Belegdatum;Leistung von;Leistung bis;Beschreibung;Belegnummer;Betrag brutto EUR;Umlagefaehig Prozent;Lohnanteil EUR;Lieferant;Begruendung;Rueckfrage
Gebäudereinigung;20.01.2025;01.01.2025;31.01.2025;Treppenhausreinigung Januar;RE-2025-001;95,20;100;80,00;Muster Gebaeudereinigung;§ 2 Nr. 9 BetrKV;
Heizung;18.06.2025;18.06.2025;18.06.2025;Wartung Heizungsanlage;RE-0815;289,00;100;180,00;Muster Heizungsbau;§ 2 Nr. 4 BetrKV;
Instandhaltung;30.06.2025;30.06.2025;30.06.2025;Austausch Umwälzpumpe;RE-0816;640,50;0;;Muster Heizungsbau;Reparatur, nicht umlagefähig;
```

## Arbeitsanweisung für die KI (Copy & Paste)

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
```
