# Datenschutz bei der Verarbeitung mit KI

**Entwurf (PR-43).** Diese Seite ist keine Rechtsberatung. Sie beschreibt,
wie die App und der KI-Workflow (`docs/KI-ANLEITUNG.md`) so eingesetzt
werden, dass möglichst wenige personenbezogene Daten die eigene
Umgebung verlassen.

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

| Quelle                                         | Personenbezug zu Mietern                            | Regel                                                                |
| ---------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Versorger-, Versicherungs-, Handwerkerrechnung | meist keiner (Objektbezug)                          | darf verarbeitet werden                                              |
| Messdienstabrechnung, Ablesebögen              | ja (Verbrauch je Wohnung, ggf. Namen)               | nur mit AVV; Namen möglichst durch Einheitskürzel ersetzen           |
| Kontoauszüge                                   | ja (Namen, Zahlungen)                               | nur benötigte Zeilen; Mietereingänge schwärzen oder pseudonymisieren |
| Datensicherung der App (JSON)                  | ja, vollständig                                     | nur an einen **lokalen** Agenten, nie in einen Chat hochladen        |
| GiroCode im PDF                                | nein (nur Vermieterkonto, Betrag, Verwendungszweck) | unkritisch                                                           |

Grundsatz Datenminimierung (Art. 5 Abs. 1 lit. c): Gib der KI nur, was für
den konkreten Schritt nötig ist.

## 3. Regeln für lokale Agenten (Claude Code, Codex)

1. **Nur lokal mit echten Daten arbeiten.** Cloud-Sitzungen (z. B. Claude
   Code im Web) klonen das öffentliche Repository in einen fremden
   Container – dort keine Belege, Sicherungen oder Ordnerpfade verwenden.
2. **Arbeitsbereich begrenzen.** Der Agent liest nur das Repository,
   `private-data/` und die freigegebenen Rechnungsordner. Lese-/Schreib-
   rechte über die Berechtigungseinstellungen des Agenten einschränken
   (bei Claude Code z. B. `.claude/settings.local.json`, nicht committet).
3. **Originale nie verändern.** Rechnungsordner nur lesen; Änderungen an
   Daten nur als Skript auf einer Sicherungskopie (siehe KI-Anleitung).
4. **Nichts Echtes ins Repository.** `private-data/` ist ignoriert. Ordner-
   pfade, Objektkürzel, Mieternamen und Beträge gehören weder in Code,
   Tests, Commits, Issues noch PR-Texte (AGENTS.md Regel 5).
5. **Geschäftstarif nutzen.** Eingaben dürfen nicht zum Training verwendet
   werden; AVV abschließen; Aufbewahrungs- und Löscheinstellungen des
   Anbieters prüfen und dokumentieren.

## 4. Ordnerverknüpfung je Objekt (PR-40)

- Die Zuordnung Objekt → Ordner liegt nur in
  `private-data/objekt-ordner.json` (Agent) bzw. im Browser-Speicher
  (App), nie im Repository, nie in der Datensicherung.
- Die Browser-App erhält nur nach ausdrücklicher Freigabe im Ordnerdialog
  Lesezugriff; sie überträgt nichts.

## 5. Checkliste

Vor dem ersten Einsatz:

- [ ] Tarif und Anbieter festgelegt; AVV abgeschlossen; Training
      ausgeschlossen.
- [ ] Drittlandübermittlung geprüft (Zertifizierung/Standardvertragsklauseln).
- [ ] Datenschutzinformation für Mieter (Art. 13) nennt die Empfänger-
      kategorie „IT- und KI-Dienstleister (Auftragsverarbeiter)“.
- [ ] Verarbeitung im Verzeichnis der Verarbeitungstätigkeiten
      (Art. 30) erfasst, soweit eines geführt wird.
- [ ] Agentenberechtigungen auf Repository, `private-data/` und
      Rechnungsordner begrenzt.

Je Abrechnungsjahr:

- [ ] Nur benötigte Belege freigegeben; Kontoauszüge reduziert.
- [ ] Übergabe-Notiz und Arbeitsdateien liegen in `private-data/`.
- [ ] `git status` vor jedem Commit geprüft – keine privaten Dateien.
- [ ] Chatverläufe/Uploads beim KI-Dienst nach Abschluss gelöscht, soweit
      nicht für Nachweise benötigt.

## 6. Offene Punkte

Siehe `docs/TASKS/PR-43-DATENSCHUTZ-KI-VERARBEITUNG.md` (E-43-1 bis
E-43-3).
