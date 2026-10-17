/**
 * Texte zum Kopieren für die Arbeit mit KI. Einzige Quelle im Code; ein Test
 * prüft, dass sie wörtlich mit `docs/KI-ANLEITUNG.md` übereinstimmen.
 * `<JAHR>` wird beim Kopieren durch das gewählte Abrechnungsjahr ersetzt.
 */

export const REPOSITORY_URL =
  'https://github.com/kalkprofijanek/nebenkosten-app'

export const AI_DOCS = {
  guide: `${REPOSITORY_URL}/blob/main/docs/KI-ANLEITUNG.md`,
  dataSources: `${REPOSITORY_URL}/blob/main/docs/DATENQUELLEN.md`,
  firstBilling: `${REPOSITORY_URL}/blob/main/docs/ERSTE-ABRECHNUNG.md`,
  example: `${REPOSITORY_URL}/blob/main/docs/beispiel/README.md`,
} as const

/** Auftrag für einen KI-Coding-Agenten mit lokaler Kopie (Ablauf 0). */
export const AGENT_PROMPT = `Du arbeitest im Repository nebenkosten-app und bereitest die Betriebs- und
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
   Punkte) nach private-data/.`

/** Arbeitsanweisung für eine Chat-KI zum Auslesen und Zuordnen von Belegen. */
export const CHAT_INSTRUCTIONS = `Du unterstützt bei der Vorbereitung einer Betriebs- und Heizkostenabrechnung
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
    sondern benenne ihn als "Rueckfrage".`

/** Setzt das Abrechnungsjahr ein; ohne Auswahl bleibt der Platzhalter. */
export function withYear(
  text: string,
  year: number | null | undefined,
): string {
  return year ? text.replaceAll('<JAHR>', String(year)) : text
}
