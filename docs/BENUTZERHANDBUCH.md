# Benutzerhandbuch

Die Nebenkosten-App erstellt Betriebs- und Heizkostenabrechnungen für
Wohnungen direkt im Browser.

**App öffnen:** <https://kalkprofijanek.github.io/nebenkosten-app/>

> **Haftungsausschluss.** Die App ist ein Rechenwerkzeug und ersetzt keine
> Rechts- oder Steuerberatung. Für die inhaltliche und formelle Richtigkeit
> einer Abrechnung (§§ 556 ff. BGB, BetrKV, HeizKV, CO2KostAufG) ist allein
> der Abrechnende verantwortlich. Prüfen Sie jede Abrechnung vor dem Versand.
> Die Software wird nach der [AGPL-3.0](../LICENSE) ohne Gewährleistung
> bereitgestellt.

## 1. Wichtig vorab: Wo liegen meine Daten?

- **Ausschließlich in Ihrem Browser** (IndexedDB). Es gibt keinen Server,
  kein Konto und keine Datenübertragung. Auch der Betreiber dieses Projekts
  sieht Ihre Daten nicht.
- Die Daten gehören zu **diesem Browser auf diesem Rechner**. Ein anderer
  Browser, ein anderes Benutzerprofil oder ein privates Fenster sieht sie
  nicht.
- **„Browserdaten löschen“ löscht auch Ihre Abrechnungsdaten.** Ohne Sicherung
  sind sie dann verloren.
- Deshalb: Nach jeder Arbeitssitzung unter **Sicherung → „JSON-Sicherung
  herunterladen“** eine Datei speichern und diese wie einen Beleg aufbewahren.
- Zusammenarbeit mehrerer Personen am selben Datenbestand gibt es nicht. Wer
  übergeben will, gibt die JSON-Sicherung weiter; der Empfänger importiert sie
  über **Daten importieren**. Danach existieren zwei unabhängige Stände.
- Nur für **Desktop-Browser** (aktuelles Chrome, Edge oder Firefox) ausgelegt.

## 2. Erster Start

Die App startet leer. Legen Sie die Stammdaten in dieser Reihenfolge an
(Menü links):

1. **Firmen** – Eigentümer bzw. Verwaltung (Absender auf der Abrechnung).
2. **Objekte** – Liegenschaft, Gebäude und Wohnungen/Einheiten mit Flächen.
3. **Abrechnungsjahre** – Abrechnungszeitraum (in der Regel Kalenderjahr).
4. **Nutzer** – Mieter je Wohnung mit Ein-/Auszugsdatum; Leerstände ergeben
   sich aus Lücken.
5. **Vorauszahlungen** – monatliche Vorauszahlungen je Nutzer.

Haben Sie Daten aus der früheren Einzeldatei-App (`nk-daten.json`), wählen
Sie stattdessen oben rechts **Daten importieren**. Die Importvorschau zeigt,
was übernommen wird, und vor dem Import wird automatisch ein
Wiederherstellungspunkt angelegt.

## 3. Jahresabrechnung in acht Schritten

Unter **Jahresabrechnung** führt die App durch alle Schritte. Jeder Schritt
zeigt offene Prüfhinweise; ein Klick auf einen Hinweis springt direkt zur
Korrekturstelle.

| Schritt                         | Was ist zu tun?                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Objekt und Zeitraum          | Liegenschaft, Wohnungen und Abrechnungszeitraum prüfen                                  |
| 2. Belegung und Vorauszahlungen | Nutzerwechsel, Leerstände und Vorauszahlungen je Wohnung prüfen                         |
| 3. Heizung und Warmwasser       | Heizkreise den Gebäuden zuordnen; Energiequelle, Warmwasser und Verteilschlüssel prüfen |
| 4. Zähler und Verbrauch         | Ablesungen und Verbrauch je Belegungszeitraum erfassen                                  |
| 5. Energie und Bestand          | Anfangsbestand, Lieferungen und Restbestand je Energiequelle erfassen                   |
| 6. Kosten und Belege            | Kostenarten anlegen, Rechnungen erfassen, Bankbuchungen zuordnen                        |
| 7. Berechnung und Vorschau      | Berechnen und Kosten, Vorauszahlungen und Salden je Wohnung kontrollieren               |
| 8. Prüfung und Abschluss        | Fehler beheben, Warnungen bestätigen, Stand freigeben                                   |

Danach unter **PDF und Export** die Einzelabrechnungen, die Gesamtabrechnung
oder ein Sammel-ZIP erzeugen. PDFs werden immer aus dem **freigegebenen**
Stand erzeugt; spätere Änderungen verändern bereits erzeugte Dokumente nicht.

## 4. Eingangsrechnungen erfassen

Unter **Kosten**:

1. **Kostenarten** einmalig anlegen (z. B. Grundsteuer, Wasser,
   Gebäudeversicherung, Hausreinigung) mit Umlageschlüssel, Text auf der
   Abrechnung, umlagefähigem Anteil und ggf. Lohnanteil (§ 35a EStG).
2. Je Rechnung eine **Kostenposition** anlegen: Kostenart, Belegdatum,
   Beschreibung, Belegnummer, Betrag in Euro, umlagefähiger Anteil.
3. Unter **Zahlungsnachweis** die Position mit der passenden Bankbuchung
   verknüpfen oder die externe Zahlung begründen.

Ab dem zweiten Jahr übernimmt **„Kostenarten aus <Vorjahr> übernehmen“**
alle noch fehlenden Kostenarten mit Umlageschlüssel, Anteilen und Text – ohne
Beträge. Erfassen Sie danach nur noch die Rechnungen des neuen Jahres.

Ist ein Lohnanteil hinterlegt, enthält jede Einzelabrechnung eine
**Bescheinigung nach § 35a EStG** für die Steuererklärung des Mieters.
Doppelt erfasste Rechnungen (gleiche Belegnummer oder gleicher Betrag am
gleichen Tag) meldet die Prüfung als Hinweis.

Achten Sie besonders auf:

- **Leistungszeitraum statt Rechnungsdatum.** Maßgeblich ist, welches Jahr die
  Leistung betrifft.
- **Nicht umlagefähige Anteile** (Reparaturen, Instandhaltung, Verwaltung)
  herausrechnen, z. B. in Wartungs- oder Hausmeisterrechnungen.
- **Brennstoffe** (Heizöl, Flüssiggas, Pellets) nicht als Kostenposition,
  sondern unter **Heizkreise → Energie und Bestand** als Lieferung mit Menge
  erfassen, damit die Bestandsbewertung stimmt.

## 5. Bankbuchungen einlesen

Unter **Kosten → Bankbuchungen** kann ein Kontoauszug als CSV-Datei
übernommen werden. Welche Formate funktionieren, steht in
[`BANK-CSV-FORMAT.md`](BANK-CSV-FORMAT.md). Eine erfundene Beispieldatei zum
Ausprobieren: [`beispiel/bankbuchungen-beispiel.csv`](beispiel/bankbuchungen-beispiel.csv).

Alle importierten Buchungen stehen zunächst auf „Offen“ und müssen einer
Kategorie und dem Abrechnungsjahr zugeordnet werden.

## 5a. Mietkonto

Unter **Mietkonto** sehen Sie je Mietverhältnis und Monat, ob Kaltmiete und
Vorauszahlung bezahlt sind. Voraussetzung: Kaltmiete am Mietverhältnis
(**Nutzer**) und Mieteingänge als Bankbuchungen.

- Nach jedem CSV-Import ordnet die App Mieteingänge **ohne Rückfrage** zu,
  wenn Name oder Mandatsreferenz eindeutig zu genau einem Mietverhältnis
  passen. Noch offene Eingänge werden nur zugeordnet, wenn der Betrag genau
  dem Monatssoll entspricht.
- Mehrdeutige oder unbekannte Zahlungen ordnen Sie auf der Seite von Hand zu.
  Jede Zuordnung lässt sich wieder aufheben.
- Die Nebenkostenabrechnung rechnet weiter mit den **vereinbarten**
  Vorauszahlungen. Besteht laut Mietkonto ein Rückstand, zeigt die Prüfung
  einen Hinweis.

## 6. Arbeiten mit Claude oder ChatGPT

Eine KI kann beim Auslesen von Rechnungen, beim Vorkontieren von
Bankbuchungen und bei der Plausibilitätsprüfung helfen. Wie das sicher
funktioniert und was Sie dabei datenschutzrechtlich beachten müssen, steht in
[`KI-ANLEITUNG.md`](KI-ANLEITUNG.md).

## 7. Sicherung und Wiederherstellung

- **Sicherung → „JSON-Sicherung herunterladen“** speichert den vollständigen
  Arbeitsstand als Datei.
- **Wiederherstellen** ersetzt den aktuellen Stand durch eine Sicherung; vorher
  wird automatisch ein Wiederherstellungspunkt angelegt.
- Sicherungsdateien enthalten personenbezogene Daten Ihrer Mieter. Speichern
  Sie sie nur an geschützten Orten und **laden Sie sie niemals in ein
  GitHub-Issue hoch**.

## 8. Hilfe und Fehler melden

- Fragen und Fehler: [Issues](https://github.com/kalkprofijanek/nebenkosten-app/issues)
  über die Vorlagen „Fehler melden“ oder „Fachfrage“.
- **Niemals echte Namen, Adressen, IBANs, Rechnungen, Zählernummern,
  Sicherungsdateien oder Screenshots mit echten Daten** anhängen. Beschreiben
  Sie den Fall mit erfundenen Werten.
- Sicherheitslücken bitte nicht öffentlich melden, sondern wie in
  [`SECURITY.md`](../SECURITY.md) beschrieben.
