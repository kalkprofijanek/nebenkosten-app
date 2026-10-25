# PR-42 – Fristenübersicht mit Kalenderexport

Stand: 21. Oktober 2026. **Verworfen:** Der Nutzer hat am 21.10.2026
entschieden, die Fristenübersicht nicht umzusetzen. Die Datei bleibt als
Konzept erhalten.

## Ziel

Übersicht je Objekt und Abrechnungszeitraum: bis wann die Abrechnung
fertiggestellt und den Mietern **zugegangen** sein muss. Export als
`.ics`-Datei (Download im Browser, keine Netzverbindung, CSP bleibt
`connect-src 'none'`).

## Fachliche Grundlage

- § 556 Abs. 3 Satz 2 BGB: Mitteilung spätestens bis zum Ablauf des
  zwölften Monats nach Ende des Abrechnungszeitraums; danach
  Nachforderungen ausgeschlossen (Ausnahme: nicht zu vertreten).
  Maßgeblich ist der **Zugang** beim Mieter, nicht das Versanddatum.
- § 556 Abs. 3 Satz 5 BGB: Einwendungsfrist des Mieters 12 Monate nach
  Zugang (informativ).

## Vorschlag

- Termine je Abrechnungszeitraum: Fristende (Zugang), interne Vorlauf-
  Erinnerung (z. B. 6 Wochen vorher), optional Ende der Einwendungsfrist ab
  erfasstem Versanddatum.
- Reine Ableitung aus `billingPeriod.periodEnd` und `dispatchDate`; keine
  Schemaänderung.
- iCalendar nach RFC 5545 (`VEVENT`, ganztägig), keine Mieternamen im
  Termin, nur Objektbezeichnung und Jahr.

## Offene Entscheidungen

- **E-42-1:** Vorlaufzeit der Erinnerung (Vorschlag 6 Wochen, Postlaufzeit
  und Zugangsnachweis einplanen).
- **E-42-2:** Abweichende Abrechnungszeiträume (nicht Kalenderjahr) und
  Gewerbemietverhältnisse (§ 556 Abs. 3 BGB gilt dort nicht unmittelbar)
  gesondert kennzeichnen?
