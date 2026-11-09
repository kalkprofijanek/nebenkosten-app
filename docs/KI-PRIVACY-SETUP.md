# KI-Privacy: lokale Bereinigung und optionaler Proxy

Stand: 9. November 2026. Diese Anleitung richtet die externe KI-Nutzung ein;
kein Bestandteil der Browser-App installiert oder aktiviert einen Filter.
Die Beispiele sind eine Einrichtungsgrundlage, hier nicht mit einem echten
KI-Anbieter end-to-end geprüft. Zuerst ausschließlich künstliche Daten nutzen.

## Empfehlung für dieses Projekt

**Bereinigte Arbeitskopien als Grundlage; Presidio für einen späteren lokalen
Automatisierungsbaustein. PrivAiTe nur experimentell evaluieren.**
Originale und eine lokale Zuordnungstabelle bleiben auf dem eigenen Rechner
außerhalb des Agenten-Arbeitsbereichs. Nur benötigte Felder werden in eine
separate Kopie übernommen; Identitäten erhalten pro Vorgang zufällige,
konsistente Ersatzkennungen. Beziehungen zwischen Datensätzen bleiben erhalten.
Dateinamen, Freitexte, Pfade, Metadaten und QR-Inhalte ebenfalls berücksichtigen.
Eine bloße Namensersetzung beweist keine Anonymität.

```text
Originale + Zuordnung (nur lokal, getrennte Zugriffsrechte)
  -> lokale Extraktion/Bereinigung
  -> bereinigte Kopien im Agenten-Arbeitsbereich
  -> optional lokaler Proxy -> Cloud-Modell -> Antwort mit Kennungen
  -> lokale Prüfung/Rückzuordnung außerhalb des Agenten-Arbeitsbereichs
  -> finale Abrechnung und PDFs lokal
```

`private-data/ki-work/` ist der Beispielpfad für bereinigte Kopien, keine
Zugriffssperre. Betriebssystemrechte, Container-Mounts oder ein eigener
Betriebssystembenutzer müssen den Zugriff auf Originale und Zuordnung
begrenzen. Ein Arbeitsverzeichnis allein beschränkt die Leserechte nicht.
Auch bereinigte Daten nicht einchecken. Rückzugeordnete Ergebnisse dürfen
nicht wieder in Dateien, Logs oder Screenshots der Cloud-Sitzung gelangen.

Beträge, Zeiträume und Verbräuche nicht zufällig verfälschen, um damit eine
Originalabrechnung zu rechnen. Nur notwendige Werte bereitstellen und ihren
verbleibenden Personenbezug prüfen. Die deterministische Fachlogik rechnet
lokal; die KI kann Skripte anhand künstlicher Daten entwickeln. Das vorhandene
`pnpm abrechnung` ist kein Anonymisierer und kann sensible Ergebnisse ausgeben:
Originaldatenläufe außerhalb der Cloud-Agenten-Sitzung selbst ausführen.

## Welche Bausteine?

| Baustein                                                         | Verwendung                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PrivAiTe](https://github.com/crp4222/PrivAiTe)                  | Lokaler Proxy mit Ersetzung und Rückzuordnung; experimenteller Kandidat, keine Produktionsfreigabe. Codex-Anbindung ist Beta.                    |
| [Presidio](https://github.com/data-privacy-stack/presidio)       | Bereits ein Erkennungsbaustein in PrivAiTe. Für eigene feste JSON-/CSV-Regeln später separat nutzbar; keine zweite Installation als Proxy nötig. |
| [Prompt Anonymizer](https://github.com/akazah/prompt-anonymizer) | Alternative für manuell bereinigte Textauszüge; keine hier geprüfte Codex-Anbindung.                                                             |

Eine eigene automatische feldweise Bereinigung samt Zuordnung ist hier noch
nicht implementiert. Bis dahin Kopien lokal manuell bereinigen und prüfen.
[Presidio weist auf Erkennungslücken hin](https://github.com/data-privacy-stack/presidio#main-features).
Ein zweiter Erkennungsfilter ist kein Nachweis vollständiger Erkennung.

## Reifegrad und Auswahlentscheidung

GitHub-Abfrage vom 9. November 2026: PrivAiTe hat 63 Sterne und drei Forks;
Presidio rund 11.800 Sterne und 1.400 Forks. PrivAiTe besteht seit Mai 2026,
Presidio seit 2018. Bei PrivAiTe stammen im Contributor-Listing 196 Beiträge
von einem Hauptentwickler, sieben von Dependabot und einer von einem weiteren
Menschen. Beide Repositorys zeigen aktuelle Aktivität.
Quellen: [PrivAiTe](https://github.com/crp4222/PrivAiTe),
[Mitwirkende](https://github.com/crp4222/PrivAiTe/graphs/contributors),
[Presidio](https://github.com/data-privacy-stack/presidio).

Sterne sind kein Sicherheitsaudit. Hier kommen aber ein junges Projekt,
starke Abhängigkeit von einem Maintainer, Codex-Beta und bekannte
Erkennungsgrenzen zusammen. Deshalb wird PrivAiTe **nicht als Standard für
Originaldaten empfohlen**. Die folgende Einrichtung ist eine Versuchsanleitung
mit künstlichen oder bereits bereinigten Daten. Es liegt durch diesen PR weder
ein unabhängiges Sicherheitsaudit noch eine praktische Anbieter-Abnahme vor.

Presidio ist die breiter etablierte Grundlage, aber ebenfalls keine fertige
Codex-Vorschaltlösung und keine Anonymitätsgarantie. Eine darauf aufbauende
lokale Verarbeitung sollte bekannte sensible JSON-/CSV-Felder vollständig
ersetzen und Freitexte zusätzlich erkennen lassen. Diese Integration müsste
separat gebaut und geprüft werden. Für den sofortigen Einstieg bleibt die
manuelle lokale Bereinigung ohne zusätzliche Proxy-Abhängigkeit verfügbar.

## PrivAiTe lokal evaluieren (experimentell)

Voraussetzungen: Python 3.11 oder neuer, eigene lokale CLI-Installation und
Zugang zum gewählten Anbieter. Einrichtung auf dem eigenen Rechner, nicht in
einer Cloud-Arbeitsumgebung mit Originaldaten. Die folgenden Bash-Beispiele
nutzen ein separates Verzeichnis außerhalb des Projekt-Repositorys.

1. Eine überprüfte Version festlegen. Beispiel: [PrivAiTe v0.8.2](https://github.com/crp4222/PrivAiTe/releases/tag/v0.8.2).
   Bibliotheken und Erkennungsmodelle werden bei der Einrichtung aus dem Netz
   geladen; das ist kein Offline-Installationsverfahren.

   ```bash
   mkdir -p "$HOME/nebenkosten-privacy-tools"
   cd "$HOME/nebenkosten-privacy-tools"
   python3 -m venv .venv
   . .venv/bin/activate
   python -m pip install 'privaite==0.8.2'
   python -m spacy download de_core_news_md
   python -m spacy download en_core_web_lg
   curl --fail --location --output privaite.yaml \
     https://raw.githubusercontent.com/crp4222/PrivAiTe/v0.8.2/config/privaite.openai.yaml
   ```

2. Die heruntergeladene Konfiguration prüfen und die folgenden Einstellungen
   **in den vorhandenen Abschnitten ändern bzw. ergänzen**, keine doppelten
   YAML-Schlüssel anhängen. Übrige Einstellungen, insbesondere die irreversible
   Behandlung von Geheimnissen, beibehalten. Deutsche Erkennung zuerst setzen.

   ```yaml
   server:
     host: '127.0.0.1'
     port: 8400
   gateway:
     enabled: true
     openai_responses:
       base_url: 'https://api.openai.com/v1'
     anthropic:
       base_url: 'https://api.anthropic.com/v1'
   pii:
     enabled: true
     on_error: 'block'
     detectors:
       presidio:
         languages: ['de', 'en']
     detection_cache:
       enabled: true
   ```

   Das ist ein Änderungsausschnitt, keine vollständige Startkonfiguration.
   Anbieter-Schlüssel und den lokalen Proxy-Schlüssel über die lokale
   Prozessumgebung oder einen Secret-Manager bereitstellen, nie in Git,
   Chat oder Shell-Historie schreiben. Die übernommene OpenAI-Konfiguration
   benötigt `OPENAI_API_KEY`, die Standardauthentifizierung `PRIVAITE_API_KEYS`.
   Die nativen Gateway-Routen haben keine eigene Proxy-Authentifizierung;
   deshalb ausschließlich Loopback, keine öffentliche Portfreigabe.

3. In der aktivierten Umgebung starten:

   ```bash
   python -m privaite --config privaite.yaml
   ```

   Einstellungen zu Sprachen, Cache und Speicherbedarf anhand der
   [versionsgebundenen Konfigurationsreferenz](https://github.com/crp4222/PrivAiTe/blob/v0.8.2/docs/configuration.md)
   prüfen. Originaldaten und Protokolle gehören nicht in dieses Werkzeugverzeichnis.

## Codex CLI anbinden

Für den dokumentierten API-Schlüssel-Weg den folgenden Anbieter in der lokalen
Benutzerkonfiguration `~/.codex/config.toml` ergänzen. Bestehende Einstellungen
sichern und gezielt zusammenführen; keinen vorhandenen Abschnitt doppeln.
Nicht die Projektkonfiguration oder einen bestehenden Cloud-Chat umschreiben.

```toml
[model_providers.privaite]
name = "PrivAiTe local privacy filter"
base_url = "http://127.0.0.1:8400/v1"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
```

Codex in einem zweiten Terminal mit verfügbarer Anbieter-Umgebungsvariable
starten; das Modell muss für dieses API-Konto freigeschaltet sein:

```bash
codex -c 'model_provider="privaite"' --model '<FREIGESCHALTETE_MODELL_ID>'
```

API-Nutzung kann separat berechnet werden. Ein ChatGPT-Abo ist kein
API-Schlüssel. PrivAiTe dokumentiert auch eine Abo-Anbindung; sie verwendet
einen undokumentierten Backend-Endpunkt und ist hier kein empfohlener
Einrichtungsweg. Die Konfiguration gilt für den so gestarteten lokalen
CLI-Prozess; keine Zusage für Desktop-App, Browser-Chat oder Cloud-Aufgaben.
[Gateway-Dokumentation](https://github.com/crp4222/PrivAiTe/blob/v0.8.2/docs/gateway.md),
[offizielle Codex-Konfiguration](https://developers.openai.com/codex/config-advanced/).

Für Claude Code beschreibt das Projekt alternativ den Start mit
`ANTHROPIC_BASE_URL=http://127.0.0.1:8400 claude`; vor Verwendung denselben
Datenwegtest durchführen. Beide CLIs nutzen denselben lokalen Filter.

## Datenweg vor Einsatz prüfen

Prüfung lokal mit einem künstlichen deutschen Beleg und erfundenen Testwerten:
Namen, Kontaktangaben, synthetische Bankdaten, Zähler-/Kundennummern und
identifizierende Freitexte. Kein echter Beleg als Testdatei.

- Zunächst an einen lokalen Mock-Anbieter senden und dessen empfangene
  Anfragen prüfen. Danach eine separate Testsitzung mit dem gewählten Anbieter
  und ausschließlich künstlichen Daten prüfen. Antwort und Wiederherstellung
  über mehrere Runden, Terminalausgaben, Werkzeugargumente und Streaming testen.
- Prüfen, ob der Anbieter-Testmitschnitt die Test-Originalwerte enthält;
  lokale CLI-Anzeige und Proxy-Logs allein belegen die Bereinigung nicht.
  Mitschnitte lokal halten und nach dem Test löschen.
- Ersatzkennungen, Datensatzbeziehungen, Summen und Rückzuordnung gegen den
  Ausgangsfall prüfen. Falsche Erkennung kann auch Zahlen und Datumswerte ändern.
- Proxy stoppen und einen Erkennungsfehler im Testaufbau auslösen: Die Sitzung
  muss fehlschlagen, ohne direkten Anbieterzugriff als Ausweichweg. Das ist eine
  Abnahmebedingung, kein durch dieses Dokument implementierter Schutz.
- Separaten Netzwerkzugriff von Shell, Browser, Plugins/MCP, Telemetrie und
  Upload-Werkzeugen prüfen bzw. begrenzen. Der Modellproxy erfasst ihn nicht.

PrivAiTe-Version, CLI-Version, Modell, Sprache, Konfiguration und Testergebnis
lokal festhalten. Nach Updates und bei neuen Datenarten erneut prüfen.
Bis zur Prüfung nur künstliche oder manuell kontrollierte bereinigte Daten.
Ein bestandener Test deckt nur die getesteten Fälle ab.

## Grenzen und vollständig lokale Alternative

PrivAiTe ersetzt erkannte Textwerte; es beweist keine vollständige
Anonymisierung. Anweisungsfelder und weitere Protokollteile sind nicht
vollständig gefiltert. Bilder, Original-PDFs, Audio und binäre Anhänge können
unverändert passieren: zuerst lokal extrahieren/bereinigen, keine pauschale
Freigabe. Auch `AGENTS.md`, `CLAUDE.md` und Systemanweisungen frei von echten
Daten halten. Verbleibende Zahlenkombinationen können Personen identifizieren.

Für **keine Arbeitsdaten ins Netz** ein vollständig lokales Modell verwenden,
beispielsweise Codex CLI mit `--oss --local-provider ollama` und lokal
vorhandenem geeignetem Modell. Zusätzlich Netzwerkwege, Plugins und Telemetrie
begrenzen und prüfen. Modell-Downloads sind ein eigener Einrichtungsschritt;
Cloud-Codex wird dadurch nicht zu einem lokalen Modell.

README erklärt die Nutzung, `AGENTS.md` und `CLAUDE.md` geben Arbeitsregeln vor;
technischen Schutz liefern nur tatsächlich eingerichtete und geprüfte
Zugriffsrechte, Bereinigung und Netzwerkregeln. Datenschutzrechtliche Prüfung
und Nutzerentscheidung gemäß [DATENSCHUTZ-KI.md](DATENSCHUTZ-KI.md) bleiben nötig.
