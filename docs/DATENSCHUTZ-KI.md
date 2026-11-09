# Datenschutz bei der Verarbeitung mit KI

Stand: 9. November 2026 (Ergänzung zu PR-43). Diese Seite ist keine Rechtsberatung.
Sie beschreibt,
wie die App und der KI-Workflow (`docs/KI-ANLEITUNG.md`) so eingesetzt
werden, dass möglichst wenige personenbezogene Daten die eigene
Umgebung verlassen.

## Grundsatz: Sie entscheiden

Die App und der KI-Workflow schreiben Ihnen nicht vor, welche Daten Sie
mit welcher KI verarbeiten. Diese Seite gibt **Empfehlungen**; die
Entscheidung treffen Sie für jeden Schritt selbst:

- Die Browser-App überträgt nichts. Ein KI-Agent erhält nur, was Sie ihm
  ausdrücklich freigeben (Ordner, Datei, Belegart).
- Der Agent fragt vor dem ersten Zugriff auf einen Rechnungsordner bzw.
  eine neue Belegart (z. B. Kontoauszüge, Ablesebögen) nach und bietet,
  wo sinnvoll, eine reduzierte oder pseudonymisierte Variante an. Sie
  wählen; der Agent dokumentiert die Wahl in der Übergabe-Notiz.
- Nichts wird automatisch gesperrt, was Sie bewusst verarbeiten wollen –
  mit einer Ausnahme: Echte Daten gelangen nie in das öffentliche
  Repository (Abschnitt 3 Nr. 4).

**Lokal gestartet bedeutet nicht lokal verarbeitet:** Codex CLI und Claude
Code können Dateiinhalte und Werkzeugausgaben an Cloud-Modelle senden.
`private-data/` und die Browser-CSP schützen diesen Datenweg nicht. Empfohlen
sind vorab bereinigte Arbeitskopien; ein optionaler lokaler Proxy und seine
Prüfung stehen in [KI-PRIVACY-SETUP.md](KI-PRIVACY-SETUP.md).

Der Maintainer nutzt einen Geschäftstarif mit Auftragsverarbeitungsvertrag.

## 1. Rollen und Rechtsgrundlage

| Beteiligter                            | Rolle (DSGVO)                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Vermieter                              | Verantwortlicher (Art. 4 Nr. 7)                                                                 |
| KI-Anbieter mit Geschäftsbedingungen   | Auftragsverarbeiter, nur mit Vertrag nach Art. 28 (AVV/DPA)                                     |
| KI-Anbieter mit Verbraucherbedingungen | in der Regel **kein** Auftragsverarbeiter – Mieterdaten dort nicht oder nur anonymisiert nutzen |
| Diese App / Maintainer                 | erhält keine Daten (lokale Verarbeitung im Browser, `connect-src 'none'`)                       |

Rechtsgrundlage für die Abrechnung selbst ist der Mietvertrag bzw. die
gesetzliche Abrechnungspflicht (Art. 6 Abs. 1 lit. b und c DSGVO,
§ 556 Abs. 3 BGB). Die Einschaltung eines KI-Dienstes ändert die
Rechtsgrundlage nicht, setzt aber AVV, Prüfung der Drittlandübermittlung
(Art. 44 ff., z. B. EU-US Data Privacy Framework oder
Standardvertragsklauseln) und passende technische Maßnahmen voraus.

## 2. Welche Daten sieht die KI?

| Quelle                                         | Personenbezug zu Mietern                                           | Empfehlung                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Versorger-, Versicherungs-, Handwerkerrechnung | Objektadresse, Ansprechpartner, Bank-/Kundendaten möglich          | benötigte Angaben lokal extrahieren und bereinigen                      |
| Messdienstabrechnung, Ablesebögen              | ja (Verbrauch je Wohnung, ggf. Namen)                              | nur mit AVV; Namen möglichst durch Einheitskürzel ersetzen              |
| Kontoauszüge                                   | ja (Namen, Zahlungen)                                              | nur benötigte Zeilen; Mietereingänge schwärzen oder pseudonymisieren    |
| Datensicherung der App (JSON)                  | ja, vollständig                                                    | Original lokal halten; Cloud-Agent nur mit benötigter bereinigter Kopie |
| GiroCode im PDF                                | Bankverbindung, Betrag und Verwendungszweck; Personenbezug möglich | auch QR-Inhalt berücksichtigen; Original-PDF nicht pauschal freigeben   |

Grundsatz Datenminimierung (Art. 5 Abs. 1 lit. c): Gib der KI nur, was für
den konkreten Schritt nötig ist.

## 3. Empfehlungen für lokale Agenten (Claude Code, Codex)

1. **Originale auf dem eigenen Rechner halten.** Keine Originalbelege,
   Sicherungen oder Zuordnungstabellen in Cloud-Arbeitsumgebungen laden.
   Auch ein lokaler CLI-Agent kann sie an ein Cloud-Modell übermitteln.
2. **Arbeitsbereich begrenzen.** Vorzugsweise nur benötigte, lokal bereinigte
   Kopien zugänglich machen. Originale, Zuordnungstabellen und finale PDFs
   durch Betriebssystemrechte oder Container-Mounts außerhalb dieses
   Arbeitsbereichs halten. Ein ignorierter Ordner genügt dafür nicht.
3. **Originale nie verändern.** Rechnungsordner nur lesen; Änderungen an
   Daten nur als Skript auf einer Sicherungskopie (siehe KI-Anleitung).
4. **Nichts Echtes ins Repository.** `private-data/` ist ignoriert. Ordner-
   pfade, Objektkürzel, Mieternamen und Beträge gehören weder in Code,
   Tests, Commits, Issues noch PR-Texte (AGENTS.md Regel 5).
5. **Geschäftstarif nutzen.** Eingaben werden nicht zum Training
   verwendet; AVV abschließen; Aufbewahrungs- und Löscheinstellungen des
   Anbieters prüfen und dokumentieren.
6. **Freigabe je Schritt.** Der Agent verarbeitet nur, was Sie in der
   jeweiligen Sitzung freigegeben haben, und fragt bei neuen Ordnern oder
   Belegarten nach (siehe Grundsatz).

Nr. 4 ist eine verbindliche Projektregel; alle übrigen Punkte sind
Empfehlungen.

## 4. Ordnerverknüpfung je Objekt (PR-40)

- Die Zuordnung Objekt → Ordner liegt nur in
  `private-data/objekt-ordner.json` (Agent) bzw. im Browser-Speicher
  (App), nie im Repository, nie in der Datensicherung.
- Die Browser-App erhält nur nach ausdrücklicher Freigabe im Ordnerdialog
  Lesezugriff; sie überträgt nichts.

## 4a. Monatliche Verbrauchsinformation und Belegprüfung

- **Monatsinformation (ADR-0014):** Jeder Mieter erhält nur seine eigenen
  Werte; Vergleiche beziehen sich nur auf sein eigenes Mietverhältnis.
  E-Mail-Versand nur mit dokumentierter Einwilligung, **ein Entwurf je
  Mieter, nie BCC an alle**. Die App versendet nichts selbst.
- **Belegprüfung und Betragsabgleich:** laufen lokal (`pnpm belegpruefung`).
  Liest ein KI-Agent die Rechnungen, gelten Abschnitt 2 und 3; Versorger-
  und Handwerkerrechnungen enthalten in der Regel keine Mieterdaten.

## 4b. Information der Mieter

Die Empfängerkategorie „IT- und KI-Dienstleister (Auftragsverarbeiter)“
und ggf. die Drittlandübermittlung gehören in Ihre Datenschutzinformation
nach Art. 13 DSGVO. Ein Muster mit Einwilligung in den E-Mail-Versand steht
in [`DATENSCHUTZ-MIETERINFORMATION.md`](DATENSCHUTZ-MIETERINFORMATION.md).

## 5. Checkliste

Vor dem ersten Einsatz:

- [ ] Tarif und Anbieter festgelegt; AVV abgeschlossen; Training
      ausgeschlossen.
- [ ] Drittlandübermittlung geprüft (Zertifizierung/Standardvertragsklauseln).
- [ ] Datenschutzinformation für Mieter (Art. 13) nennt die Empfänger-
      kategorie „IT- und KI-Dienstleister (Auftragsverarbeiter)“ (Muster:
      `DATENSCHUTZ-MIETERINFORMATION.md`); Übergabe dokumentiert.
- [ ] Einwilligungen in den E-Mail-Versand liegen vor und sind mit Datum
      am Mietverhältnis erfasst.
- [ ] Verarbeitung im Verzeichnis der Verarbeitungstätigkeiten
      (Art. 30) erfasst, soweit eines geführt wird.
- [ ] Agentenberechtigungen auf Code und bereinigte Arbeitskopien begrenzt;
      Originale und Zuordnungstabellen getrennt.
- [ ] Bei Proxy-Einsatz Datenweg, deutsche Erkennung, Rückzuordnung und
      Fehlerverhalten mit künstlichen Daten geprüft (KI-Privacy-Einrichtung).

Je Abrechnungsjahr:

- [ ] Nur benötigte Belege freigegeben; Kontoauszüge reduziert.
- [ ] Übergabe-Notiz und Arbeitsdateien liegen in `private-data/`.
- [ ] `git status` vor jedem Commit geprüft – keine privaten Dateien.
- [ ] Chatverläufe/Uploads beim KI-Dienst nach Abschluss gelöscht, soweit
      nicht für Nachweise benötigt.

## 6. Vorschaltlösung und verbleibender Ausbau

Die frühere Zurückstellung E-43-2 wird durch die neue Empfehlung ergänzt:
PrivAiTe lässt sich experimentell mit künstlichen Daten testen; Presidio ist
bereits ein Baustein darin. Anleitung, Grenzen und Abnahme stehen in
[KI-PRIVACY-SETUP.md](KI-PRIVACY-SETUP.md). Eine eigene feldweise
Pseudonymisierung für JSON/CSV mit lokaler Rückzuordnung bleibt ein möglicher
Folgeauftrag. Dieser PR implementiert und aktiviert keine solche Verarbeitung.

Eine technische Commit-Sperre für Ordnerpfade (E-43-3) bleibt zurückgestellt.
Der vorhandene Repository-Scan bleibt aktiv, prüft aber keine ausgehenden
KI-Anfragen. Die frühere Begründung „liegt lokal, daher geschützt“ reicht
für Cloud-Modellzugriffe nicht aus.
