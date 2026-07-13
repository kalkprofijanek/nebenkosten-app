# Legacy-Bestandsaufnahme: `legacy/index.html`

Stand: 2026-07-13
Autor: Fable (PR 01 – Bestandsaufnahme und Refactor-Map)
Bezug: `MASTERPLAN_MIGRATION_FABLE_CODEX.md`, Abschnitte 3, 4.2, 5, 6, 7, 9, 10, 20, 21.

Diese Datei ist ein reines Lese-Ergebnis. Es wurde **keine Zeile** in `legacy/index.html`
verändert. Die Datei hat 6275 Zeilen (HTML/CSS/JS in einer Datei) und wurde vollständig
gesichtet. Migrationskritische Pfade wurden im Detail nachvollzogen; bei nur gruppiert
erfassten oder noch unsicheren Pfaden ist die Prüftiefe ausdrücklich ausgewiesen. Alle
Aussagen unten beziehen sich auf die sanitisierte, noch nicht abschließend
anonymitätsgeprüfte GitHub-Baseline im Commit `b9ce5e2`. Ihr SHA-256 lautet
`874af27415add7aeea330592c3e45da78a7c3e20e46dfcb8d71abbba6d21abab`.

Diese GitHub-Baseline ist nicht byte- oder vollständig verhaltensgleich mit der
ausschließlich lokal aufbewahrten produktiven Original-App. Insbesondere bereinigte
Seed-, Zuordnungs- und Klassifizierungswerte können abweichen; Vergleiche mit dem
Produktivoriginal erfolgen ausschließlich lokal und ohne Übertragung von Ein- oder
Ausgabedaten nach GitHub.

---

## 1. Überblick

### 1.1 Architektur der Datei

- Zeilen 1–163: `<head>` mit eingebettetem `<style>` (komplettes CSS, kein separates
  Stylesheet). Externe Skripte werden per CDN geladen (Zeilen 7–9): `pdfmake` 0.2.7,
  `vfs_fonts.js` (Schriftarten für pdfmake), `jszip` 3.10.1 (für den ZIP-Export der
  Einzel-PDFs). Diese drei Bibliotheken sind die einzigen externen Laufzeitabhängigkeiten.
- Zeilen 164–242: `<body>` mit statischem HTML-Grundgerüst: Header mit Speicher-Buttons,
  ein Bereich `.wrap` mit mehreren `<section class="screen">`-Blöcken (Firmen, Firma-Detail,
  Abrechnungsjahr-Auswahl, Objekt-Arbeitsbereich mit 7 Tabs), ein generisches Modal-Grundgerüst.
  Es gibt **kein Routing über die URL** (kein `history.pushState`, keine Hash-Navigation) —
  Navigation läuft ausschließlich über `App.view`/`App.go()` und DOM-Klassen `.screen.active`.
- Zeilen 243–6273: `<script>` mit dem gesamten JavaScript. Kein Modulsystem (kein
  `import`/`export`, kein Bundler) — alles im globalen Scope bzw. an drei große
  Objektliteralen hängend: `Store` (Persistenz, Zeile 957), `Engine` (Berechnung,
  Zeile 2388), `App` (UI-Rendering + Interaktion, Zeile 2685–6271). Am Dateiende
  (Zeile 6272) wird `App.init()` synchron beim Laden aufgerufen.
- Rendering-Ansatz: **String-Templating + `innerHTML`**. Jede `App.renderX()`/`App.oTabX()`-
  Methode baut einen HTML-String zusammen und schreibt ihn per `el.innerHTML=...` in den
  DOM. Event-Handler werden größtenteils als Inline-`onclick="App.methode(...)"`-Attribute
  im HTML-String erzeugt; nur die generische `feld()`-Bindung (Zeile 2834) nutzt Event-
  Delegation über eine `Map` (`_feldHandlers`, Zeile 246) plus einen einzigen
  `document.addEventListener('change', ...)`.
- Es gibt **keinen Virtual-DOM/Diffing-Mechanismus**: bei jeder Datenänderung wird i. d. R.
  der gesamte aktuelle Tab-Bereich neu gerendert (`Store.markDirty()` → meist gefolgt von
  `App.renderObjekt()`).

### 1.2 Globaler Programmablauf

```
App.init()
  → Store.init()              // Daten laden (localStorage + optionale Datei via File System Access API)
  → Migrationen je Objekt      // migrateObjekt(o), syncBuchungenForObjekt(o)
  → App.wireUp()                // globale Event-Handler (Header-Buttons, Tabs, Modal, beforeunload)
  → Store.initTabWatch()        // BroadcastChannel: Mehrfach-Tab-Warnung
  → App.go('firmen')            // erste Ansicht rendern
```

### 1.3 Screens/Views (`App.view`)

| View | Render-Methode | Inhalt |
|---|---|---|
| `firmen` | `renderFirmen()` (Z. 2876) | Kartenliste aller Eigentümer/Verwalter (Firmen) |
| `firma` | `renderFirma()` (Z. 2898) | Firmenstammdaten + Kartenliste der Objekte/Liegenschaften dieser Firma |
| `abrechnungen` | `renderAbrechnungen()` (Z. 2959) | Liste der Abrechnungsjahre eines Objekts + eingebetteter Buchungen-Bereich |
| `objekt` | `renderObjekt()` (Z. 3174) | 7 Tabs eines geöffneten Abrechnungsjahres: `stamm`, `nutzer`, `kosten`, `heizung`, `co2`, `abrechnung`, `freigabe` |

Zusätzlich ein generisches Modal (`App.modal()`, Z. 2796) für Dialoge (Beleg-Verwaltung,
Zähler-Zuordnung, VZ-Anpassungsassistent, §9a-Schätzassistent, Fehlerdialoge etc.) mit
Fokus-Trap und Escape-Handling.

---

## 2. Globaler State & Datenobjekte

| Objekt | Zeile | Rolle |
|---|---|---|
| `Store` | 957 | Persistenzschicht: hält `Store.data` (die komplette Anwendungsdatenstruktur), verwaltet localStorage, File System Access API (OneDrive-Datei), IndexedDB-Snapshots, Import/Export, Konflikt-/Versions-Schutz. |
| `Store.data` | 958 | Wurzel des persistierten Datenbaums: `{version, gespeichert, firmen: []}`. |
| `Engine` | 2388 | Zustandslose Berechnungsfunktionen (CO₂, Brennstoff/FIFO, Heizkosten, Gesamtabrechnung). Nimmt ein Objekt `o` (aktuelle Abrechnung) entgegen und liefert ein Ergebnisobjekt zurück — **mutiert das Eingabeobjekt nicht**, ist damit der Teil, der einer „reinen Funktion" im Sinne des Masterplans (Abschnitt 6.1) am nächsten kommt (siehe Abschnitt 8 unten für Einschränkungen). |
| `App` | 2685–6271 | UI-Controller + Renderer: hält Navigationszustand (`view`, `otab`, `firma`, `objekt`, `abrechnung`, `erg`, diverse `_filter`/`_sort`-UI-States) und ca. 150 Methoden für Rendering, CRUD, PDF-Erzeugung, Buchungsabgleich. |
| Block-Seed-Konstante (Symbol bewusst nicht zitiert) | 499 | Sanitisierte Default-Struktur von 4 Heizkreis-Blöcken (B1–B4) mit Namen, Kürzel, Mandatsref-Präfixen und Energieträger. Wird kopiert nach `o.bloecke`, wenn ein Objekt noch keine eigene Block-Konfiguration hat; kann vom lokalen Produktivoriginal abweichen. |
| `STANDARD_KOSTENARTEN` | 1319 | Katalog der BetrKV-Pflicht-/Regelpositionen, die je Abrechnungsjahr automatisch angelegt werden (`ensureStandardKostenarten`, Z. 1337). |
| `BETRKV_KAT` | 585 | Dropdown-Katalog der §2-BetrKV-Kategorien mit vordefiniertem Typ/Umlageschlüssel/Kostentext (UI-Autofill). |
| `UMLAGE_OPT` | 257 | Erlaubte Umlageschlüssel: `m2_nf`, `m2_nf_hzg`, `einheiten`, `we_anzahl`, `direkt`. |
| `CO2_FAKTOR_DEF` / `CO2_FAKTOR_HK` | 266/269 | CO₂-Emissionsfaktoren (kg CO₂/kWh) je Energieträger. |
| `HEIZWERT_DEF` | 267 | Heizwerte (kWh/Einheit) je Energieträger. |
| `BEHG_PREIS` / `BEHG_PREIS_DEFAULT` | 271/272 | CO₂-Preis (€/t) je Jahr nach BEHG-Stufenplan, mit Fallback. |
| `STROMZAEHLER_SEED` | 1983 | Sanitisierte, hart codierte Beispielstruktur für Stromzähler-Stammdaten. Noch nicht abschließend anonymitätsgeprüft; fachliche Zuordnung kann vom lokalen Produktivoriginal abweichen (Risiko 8.1). |
| `HAUSWART_VERTRAG_INFO` / `HAUSWART_SPLIT_STANDARD` | 2281/2291 | Sanitisierte, hart codierte Vertrags-/Aufteilungsstruktur. Noch nicht abschließend anonymitätsgeprüft und nicht als produktive Stammdaten übernehmen (Risiko 8.1). |
| `BUCH_KATEGORIEN` | 256 | Kategorien für importierte Kontobuchungen (`OFFEN`, `NK_UMLEGBAR`, `NK_NICHT_UMLEGBAR`, `MIETEINGANG`, `KAUTION`, `INSTANDHALTUNG`, `VERWALTUNG`, `SONSTIGE`). |
| `_feldHandlers` | 246 | `Map<elementId, handlerFn>` für die generische Formular-Feld-Bindung. |
| `_syncOrphansCache` | 2143 | `WeakMap<objekt, orphanListe>` — nicht persistiert, hält das Ergebnis der letzten `syncBuchungenForObjekt`-Ausführung für die Freigabeprüfung vor. |

**Persistenzstruktur** (`Store.data`):

```
Store.data
  version               // = APP_SCHEMA_VERSION (Konstante 3)
  gespeichert           // ISO-Timestamp letzter Speicherung
  firmen: [
    Firma {
      ..., objekte: [
        Objekt {
          ...(Stammdaten), bloecke: [...], stromzaehler: [...], buchungen: [...],
          abrechnungen: [
            Abrechnung { jahr, zeitraum, nutzer:[...], kostenarten:[...], heizkreise:[...], ... }
          ]
        }
      ]
    }
  ]
```

Historisch lagen Nutzer/Kostenarten/Heizkreise/Zeitraum/Vorgaben direkt auf `Objekt` (Schema
vor Einführung von `abrechnungen[]`); `migrateObjekt()` (Z. 2008) verschiebt sie beim ersten
Öffnen nach `abrechnungen[0]` und entfernt die Root-Felder. Dieser Migrationspfad muss beim
Import alter Exporte weiterhin unterstützt werden.

---

## 3. Datenmodell Schema Version 3

`APP_SCHEMA_VERSION = 3` (Zeile 903). Die folgenden Entitäten sind **so dokumentiert, wie sie
tatsächlich im Code verwendet werden** — nicht wie sie „sein sollten". Felder ohne erkennbaren
Pflicht-Charakter sind als „optional" markiert; alles andere ist in der Praxis meist gesetzt,
aber nirgends mit einem echten Schema/Validator erzwungen (siehe Risiko 8.2).

### 3.1 Firma (Eigentümer/Verwalter) — `seedData()` Z. 884, `App.neueFirma()` Z. 2890

| Feld | Typ | Pflicht/optional |
|---|---|---|
| `id` | string (`uid('f')`) | Pflicht |
| `name1..name4` | string | `name1` faktisch Pflicht (Rechtsprüfung Z. 1718), Rest optional |
| `strasse`, `plz_ort`, `postfach` | string | optional |
| `ansprechpartner` | `{anrede, vorname, name, telefon, mobil, fax, email}` | optional |
| `bank` | `{iban, bic, kontoinhaber, kreditinstitut}` | `iban` Fallback für Objekte ohne eigene IBAN (Z. 1707) |
| `objekte` | `Objekt[]` | Pflicht (Array, ggf. leer) |

### 3.2 Objekt (Liegenschaft) — `App.neuesObjekt()` Z. 2938–2946, `migrateObjekt` Z. 2008

Stammdaten-Ebene (bleibt bei Migration auf dem Objekt, jahresunabhängig):

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (`uid('obj')`) | Pflicht |
| `eigene_nr`, `objekt_nr` | string | interne/externe Objektnummer |
| `strasse`, `plz_ort` | string | Pflicht für Freigabe (Z. 1719) |
| `iban`, `kontoinhaber` | string | objekteigene Bankverbindung, Fallback auf Firma |
| `bloecke` | `Block[]` | Heizkreis-Blöcke (siehe 3.9), Default = Kopie der Block-Seed-Konstante in Z. 499 |
| `stromzaehler` | `Stromzaehler[]` | objektweit, jahresunabhängig (siehe 3.10) |
| `buchungen` | `Buchung[]` | importierte Kontobewegungen, jahresunabhängig zugeordnet über `abr_jahr` je Split (siehe 3.11) |
| `abrechnungen` | `Abrechnung[]` | ein Eintrag je Abrechnungsjahr (siehe 3.3) |
| `standardKostenartenStatus` | historisch auch auf Objekt-Root, in Praxis pro Abrechnung (Doppel-Existenz je nach Migrationsstand) | |
| `excel_quelle` | `{leerstand_2024, mietparteien_2024, gesamtwohnflaeche}` | optionaler Herkunftsvermerk aus einem historischen Excel-Import |
| `_betrKVNumFix`, `_betrKVNumFixInfo` | boolean/number | Migrationsflags (einmalig, siehe Abschnitt 4.11) |

Vor Einführung von `abrechnungen[]` lagen zusätzlich direkt auf `Objekt`: `jahr`, `zeitraum`,
`vorgaben`, `gesamt`, `nutzer`, `kostenarten`, `heizkreise`, `brennstoff`, `co2`, `hinweise`,
`standardKostenartenStatus` — diese werden von `migrateObjekt()` nach `abrechnungen[0]`
verschoben und vom Objekt gelöscht.

### 3.3 Abrechnung (Abrechnungsjahr) — `migrateObjekt` Z. 2018, `App.neuesAbrechnungsjahr()` Z. 3055

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (`uid('abr')`) | Pflicht |
| `jahr` | number | Pflicht, muss zu `zeitraum` passen (`pruefeJahrZeitraum`, Z. 1433) |
| `zeitraum` | `{von, bis}` (ISO-Datum `YYYY-MM-DD`) | Pflicht |
| `status` | string, eine von `Entwurf`, `Prüfung offen`, `PDF bereit`, `abgeschlossen`, `veraltet` | Freigabe-Workflow, siehe Abschnitt 4.9 |
| `versanddatum` | ISO-Datum | optional, startet §556-Abs.-3-Frist |
| `vorgaben` | `{verbrauch_proz, grund_proz, grundkosten_umlage, solar_proz, betriebsstrom_proz, mwst_modus, abweichung_begruendung}` | Objekt-globale Heizungsvorgaben; je Heizkreis überschreibbar |
| `gesamt` | `{flaeche, flaeche_hzg, personen, einheiten, we}` | manuell gepflegter Gesamtnenner (Leerstandsbehandlung) |
| `nutzer` | `Nutzer[]` | siehe 3.4 |
| `kostenarten` | `Kostenart[]` | siehe 3.5 |
| `standardKostenartenStatus` | `{[std.key]: {aktiv:boolean, grund:string}}` | Aktivierungsstatus je Standardkostenart |
| `heizkreise` | `Heizkreis[]` | siehe 3.9 |
| `brennstoff`, `co2` | Legacy-Einzelblock (Fallback, wenn `heizkreise` fehlt) | siehe `Engine.hkDaten` Z. 2397 |
| `hinweise` | `{allgemein, guthaben, nachzahlung}` | Freitexte für PDF |
| `anschreiben` | `{aktiv:boolean, text:string}` | optionales Serienanschreiben mit Platzhaltern |
| `_protokoll` | `ProtokollEintrag[]` | Freigabeprotokoll (append-only, siehe 3.13) |
| `_ts` | number (ms) | Timestamp letzter Änderung (`Store.markDirty`) |

### 3.4 Nutzer (Nutzungseinheit/Mieter) — `App.addN()` Z. 3453, `App.insertN()` Z. 3420

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (`uid('n')`) | Pflicht |
| `nr` | number | Anzeige-/Sortierreihenfolge, wird bei jedem Insert neu durchnummeriert |
| `aktiv` | `'J'`\|`'N'`\|`'Leerstand'` | Anzeige-Ampel; „Leerstand" als Wert ist eines von mehreren Leerstands-Kriterien (siehe `istLeerstand`, Z. 750) |
| `leerstand` | boolean | alternative/zusätzliche Leerstandsmarkierung |
| `name` | string | Freitext-Name, alternativ aus `vorname`+`nachname` (`nutzerName()`, Z. 718) |
| `vorname`, `nachname` | string | optional |
| `anrede` | einer von `ANREDE` (`''`, `Herr`, `Frau`, `Familie`, `Firma`) | optional |
| `nutzeinheit`, `lage` | string | Wohnungs-/Einheitenbezeichnung |
| `mandatsref` | string, Konvention `<Präfix>_<Nr\|leerstand>`, z. B. `<BLOCK_PREFIX>_001` | zentraler Schlüssel für Block-/Haus-Zuordnung (`blockVonRef`, `hausKeyVonRef`) |
| `firma_privat` | string, `'Privat'` default | |
| `email` | string | optional, für Freigabeprüfung relevant |
| `eingezogen`, `ausgezogen` | ISO-Datum | tagegenauer Nutzungszeitraum; leer/„weiter wohnhaft" = kein Auszug |
| `flaeche_nf`, `flaeche_nf_hzg` | number (m²) | Nutzfläche bzw. Heizfläche; `setFlaeche()` (Z. 3370) setzt beide synchron |
| `personen` | number | für Personenschlüssel und WW-Verteilung |
| `zimmer` | number | erfasst, aber in der Berechnung ungenutzt (siehe Risiko 8.4) |
| `einheiten` | number | HKV-Verbrauchseinheiten (Heizkostenverteiler-Ablesewert) |
| `einheiten_geschaetzt` | boolean | §9a-HeizKV-Schätzung aktiv |
| `einheiten_schatz_grund` | string | Begründungstext der Schätzung |
| `kuerzung12_anwenden` | boolean | wendet die 15%-Kürzung nach §12 HeizKV direkt in der Berechnung an |
| `kosten_scope`, `grundsteuer_key` | string (Block-ID oder Haus-Key) | manuelle Bereichszuordnung, überschreibt Ableitung aus `mandatsref` |
| `vz_monat` | number (€) | monatliche Vorauszahlung |
| `vz_gesamt` | number (€) | alternative Jahres-Vorauszahlung (anteilig bei Teiljahr) |
| `keine_vz_vereinbart` | boolean | §556 Abs. 2 BGB — keine VZ vereinbart |
| `miete_monat` | number | erfasst (Seed-/Add-Funktion), in Berechnung nicht verwendet |
| `versand_strasse`, `versand_plz_ort` | string | abweichende Versandadresse für PDF |
| `versanddatum_nutzer` | ISO-Datum | Mieter-individuelles Versanddatum (überschreibt `abr.versanddatum`) |
| `bemerkung` | string | Freitext |
| `kaltwasser_m3` / `wasser_m3` | number | für Techem-artige Ablesewerte-Tabelle im PDF (Z. 5759) |
| `_abrStatus` | string | wird von `alleFreigeben()` gesetzt (`'PDF bereit'`), aber nirgends sonst ausgewertet (siehe Risiko 8.4) |

### 3.5 Kostenart (Kostenposition) — `App.addK()` Z. 3924, `ensureStandardKostenarten` Z. 1337

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (`uid('k')`) | Pflicht |
| `standard_key` | string, referenziert `STANDARD_KOSTENARTEN[].key` | gesetzt nur bei automatisch angelegten Standardpositionen |
| `typ` | `'betrieb'`\|`'wasser'`\|`'heizung'` | steuert Umlagelogik grundlegend (Heizung fließt in 70/30-Topf) |
| `bezeichnung`, `kostentext` | string | `kostentext` erscheint auf der Abrechnung, `bezeichnung` intern (teils identisch verwendet) |
| `betrKV_kat` | string, Wert aus `BETRKV_KAT` oder `'NICHT_UML'` | rechtliche Kategorisierung |
| `umlage_nach` | Wert aus `UMLAGE_OPT` (`m2_nf`, `m2_nf_hzg`, `einheiten`, `we_anzahl`, `direkt`) | bei `typ==='heizung'` in der UI deaktiviert (Heizschlüssel fest) |
| `betrag` | number (€, **Fließkomma, nicht Cent**) | Gesamtbetrag der Kostenart; wird bei belegverknüpften Positionen aus `rechnungen[].betrag` neu berechnet |
| `datum` | ISO-Datum | Rechnungsdatum |
| `scope_key` | string (Block-ID oder Haus-Key) | leer = ganzes Objekt |
| `rechnungen` | `Beleg[]` | Einzelbelege, siehe 3.6 |
| `betriebsstrom_abzug` | boolean | markiert diese Position als Quelle für die Betriebsstrom-Realloaktion |
| `abrechnung_ausblenden` | boolean | Position bei Betrag 0 aus der Abrechnung ausblenden |
| `umlage_proz` | number (0–100) | Kostenart-weiter Umlagegrad-Fallback (siehe `umlageProz`, Z. 2354) |
| `lohn_anteil_proz` | number (0–100) | §35a-EStG-Lohnanteil für die Steuerbescheinigung |
| `aus_grundsteuer_import`, `grundsteuermessbetrag_eur` | boolean/number | Herkunftsmarker aus einem (nicht in dieser Datei enthaltenen) Grundsteuer-Import-Feature |

### 3.6 Beleg/Rechnung (Kostenart-Unterobjekt) — `App.addBelegRow()` Z. 3889, `kostenBelege()` Z. 3947

| Feld | Typ | Bemerkung |
|---|---|---|
| `datum` | ISO-Datum | |
| `bezeichnung` | string | |
| `betrag` | number (€) | |
| `beleg` | string | Dateiname/Belegnummer, Freitext |
| `datei_data`, `datei_name`, `datei_typ` | string (Base64) / string / string | angehängte Beleg-Datei (max. 4 MB, PDF/JPEG/PNG/WEBP), siehe `belegDateiPruefen` Z. 743 |
| `umlage_proz` | number (0–100) | Beleg-individueller Umlagegrad, überstimmt `Kostenart.umlage_proz` sobald Belege mit Betrag existieren |
| `_buchung` | string (Buchungs-ID) | Verknüpfung zur Kontobuchung |
| `_buchung_split` | string (Split-ID) | falls aus einem Buchungs-Split übernommen |
| `_extern_ok`, `_extern_grund` | boolean/string | manuelle Bestätigung „extern bezahlt" statt Buchungsverknüpfung |
| `_stromzaehler_id` | string | Zuordnung zu einem Stromzähler |
| `_geschaetzt`, `_schaetzung_grund` | boolean/string | manuell übernommener Schätzwert ohne Beleg |

### 3.7 Block (Heizkreis-Definition, jahresunabhängig) — Block-Seed Z. 499, `App.addBlk()` Z. 4273

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string, Konvention `B1`..`B9` | Pflicht, referenziert von `Heizkreis.id` (1:1) |
| `name`, `kuerzel` | string | Anzeigename |
| `energietraeger` | string, freier Text (z. B. `Heizöl`, `Pellets`, `WP Mono`, `Hybrid WP+Gas`) | Default für neue Heizkreise |
| `prefix` | `string[]` | Mandatsref-Präfixe zur automatischen Nutzer-Zuordnung (`blockVonRef`, Z. 512) |
| `hk` | string | im Block-Seed vorhanden, im Code sonst nicht ausgewertet (Altfeld, siehe Risiko 8.4) |

### 3.8 Heizkreis (jahresbezogen, `Abrechnung.heizkreise[]`) — `App.ensureHeizkreise()` Z. 4244

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string, = zugehöriger `Block.id` | Pflicht |
| `brennstoff` | `{art, heizwert_kwh, anfangsbestand_menge, anfangsbestand_wert, anfangsbestand_preis, restbestand_menge, lieferungen: Lieferung[]}` | „Haupt"-Energiequelle; bei Hybrid-Heizkreis (B4) redundant zur ersten `energiequellen[]`-Quelle gehalten (`syncHkBrennstoffSummary`, Z. 482) |
| `energiequellen` | `Energiequelle[]` (siehe 3.9) | nur bei Hybrid-Heizkreisen (aktuell nur B4) mit >1 Eintrag |
| `co2` | `{modus:'auto'\|'manuell', co2_faktor_kg_kwh, co2_preis_eur_t, abgabe, aufteilung_vermieter_proz, kennwert_kg_m2a}` | CO₂-Parameter; `manuell` überschreibt die automatische Berechnung komplett |
| `vorgaben` | `{verbrauch_proz, grund_proz, betriebsstrom_proz}` | überschreibt objektweite `Abrechnung.vorgaben` für diesen Heizkreis |
| `hat_warmwasser` | boolean | aktiviert zentrale Warmwasserabrechnung nach §9 HeizKV |
| `ww_anteil_proz` | number (18–70), Default 18 | Anteil der Brennstoffkosten für Warmwasser |

### 3.9 Energiequelle (`Heizkreis.energiequellen[]`) — `defaultHeizquellen()` Z. 273

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (z. B. `haupt`, `wp_strom`, `gas`) | Pflicht |
| `name`, `art` | string | Anzeigename/Energieträger |
| `heizwert_kwh` | number (kWh je Mengeneinheit) | |
| `co2_faktor_kg_kwh` | number | |
| `anfangsbestand_menge`, `anfangsbestand_wert`, `anfangsbestand_preis` | number | `anfangsbestand_preis × menge` kann `anfangsbestand_wert` automatisch befüllen (`App._autoAnfWert`, Z. 4297) |
| `restbestand_menge` | number | Endbestand am Periodenende (Schätzung/Messung) |
| `lieferungen` | `Lieferung[]` | |

### 3.10 Lieferung (`Energiequelle.lieferungen[]` / `brennstoff.lieferungen[]`)

| Feld | Typ | Bemerkung |
|---|---|---|
| `datum` | ISO-Datum | |
| `menge` | number | |
| `mengeneinheit` | string (`l`, `kg`, `kWh`, …) | nur bei aus Buchungen generierten Lieferungen gesetzt |
| `mengenstatus`, `mengenhinweis` | string | Herkunfts-/Vertrauensmarker der Menge (z. B. `menge_aus_beleg`, `menge_fehlt_beleg_pruefen`, `stromkosten_ohne_physische_brennstoffmenge`) |
| `betrag` | number (€) | |
| `bezeichnung`, `beleg` | string | |
| `_buchung`, `_buchung_split` | string | Verknüpfung zu `Buchung`/Split |
| `_menge_manuell` | boolean | Menge wurde manuell überschrieben (bleibt bei Buchungs-Resync erhalten) |
| `_extern_ok`, `_extern_grund` | boolean/string | wie bei Beleg |
| `_stromzaehler_id` | string | Zuordnung zu Wärmezähler |
| `_konvertiert_von_kostenart` | string (Kostenart-ID) | Herkunftsmarker, wenn per `verschiebeBelegAlsLieferung` erzeugt |

### 3.11 Stromzähler (`Objekt.stromzaehler[]`, jahresunabhängig) — `STROMZAEHLER_SEED` Z. 1983

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string | Pflicht |
| `adresse` | string | |
| `zaehlernummer`, `malo_id` | string | mind. eines meist vorhanden |
| `art` | `'allgemein'`\|`'waerme'` | steuert, wo der Zähler zuordenbar ist (Kostenart „Beleuchtung" bzw. Heizkreis-Wärmelieferung) |
| `anbieter` | string | Freitext |
| `vertragsnummer_oder_konto` | string | für exakten Abgleich mit Buchungstexten (`extrahiereVertragsnummern`, Z. 1510) |
| `heizkreis_id` | string, Format `<blockId>:<quelleId>` (z. B. `B3:haupt`, `B4:wp_strom`) | nur bei `art==='waerme'` |
| `gueltig_von`, `gueltig_bis` | ISO-Datum | Gültigkeitszeitraum des Zählers |
| `zaehlernummer_status` | `'offen'`\|`'bestaetigt'` | |
| `notiz`, `zusatz_hinweis` | string | Freitext |
| `jahresstatus` | `{[jahr]: {buchung_vorhanden, jahresrechnung_vorhanden, notiz, schaetzung_betrag, schaetzung_grund}}` | jahresbezogener Checklisten-Status, rein manuell gepflegt (bewusst kein Auto-Matching, siehe Kommentar Z. 1970–1981) |

### 3.12 Buchung (importierte Kontobewegung, `Objekt.buchungen[]`) — `buchImportCSV()` Z. 4708

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string (`uid('bch')`) | Pflicht |
| `hash` | string | Dedupe-Schlüssel aus Datum+Betrag+Auftraggeber+Zweck (`buchHash`, Z. 4611) |
| `datum` | ISO-Datum | |
| `betrag` | number (€, Vorzeichen: Ausgabe negativ) | |
| `auftraggeber` | string | |
| `verwendungszweck` | string | |
| `buchungstext` | string | CSV-Spalte „Buchungstyp" |
| `kategorie` | Wert aus `BUCH_KATEGORIEN` | automatisch klassifiziert (`buchAutoKlassifiziere`, Z. 4616), manuell änderbar |
| `bemerkung` | string | automatisch vorbelegt, editierbar |
| `kostenart_id`, `abr_jahr` | string/number | Ziel-Zuordnung (falls kein Split verwendet wird) |
| `umlage_proz` | number | wie bei Beleg |
| `splits` | `BuchungSplit[]` | Aufteilung einer Buchung auf mehrere Kostenarten/Jahre |
| `_heizkreis` / `_hk` | string, Format `<blockId>:<quelleId>` | alternative Zuordnung zu einer Heizkreis-Lieferung statt Kostenart |
| `_geprueft` | boolean | sperrt weitere Änderungen an dieser Buchung |
| `_hauswartvertrag` | boolean | markiert Buchungen des Hauswartvertrags (spezielle Split-Vorlage) |
| `_importiert` | ISO-Timestamp | |

`BuchungSplit`: `{id, betrag, kostenart_id, abr_jahr, bemerkung, umlage_proz, kategorie, _hauswartvertrag}`.

### 3.13 Sonstige Strukturen

- **Vorauszahlung**: kein eigenes Entity-Objekt, sondern Felder auf `Nutzer` (`vz_monat`,
  `vz_gesamt`, `keine_vz_vereinbart`) plus die reine Funktion `vorauszahlungGesamt(n,z)`
  (Z. 705), die daraus den periodenanteiligen Jahresbetrag ableitet.
- **Abrechnungsergebnis** (`Engine.rechne()`-Rückgabe, nicht persistiert, nur `App.erg`
  zur Laufzeit): `{bz, heizGesamt, grundK, verbrK, brennVerb, heizBetrieb, betriebsstrom,
  co2Abgabe, co2Mieter, co2Verm, co2, blockHeiz, kpos, nutzer, alleNutzer, erfassteKosten,
  interneKostenSum, direktKostenSum, vermieterKosten, leerstand, leerstandZeilenKosten,
  leerstandOffenKosten, heizUnscopedVermieter, freianteilVermieter, kontrollDiff,
  heizUnscopedWarn, gesamtkosten, vzSumme}`. Je Nutzer: `{nutzer, tage, zf, voll, pos[],
  co2Betrag, co2Einh, co2Gesamt, co2MieterGesamt, co2Mieterproz, preisCo2, summe, vz, saldo,
  ampel, warn[], leerstand, kuerzung12, lohn35a}`.
- **Prüfstatus/ValidationIssue**: `{level:'error'|'warn'|'info', area, title, detail}`,
  erzeugt von `check()` (Z. 1443) und gesammelt in `buildFreigabeChecks()` (Z. 1804).
- **ProtokollEintrag** (`Abrechnung._protokoll[]`): `{ts, aktion, nutzerAnzahl?, fehler?,
  warnungen?, version?}` — append-only Audit-Log für Statusänderungen, PDF-Erstellung,
  Stromzähler-Bestätigungen usw.
- **Freigabestatus** ist nicht als separates Entity modelliert, sondern das Feld
  `Abrechnung.status` mit dem informellen Statusautomaten (siehe Abschnitt 4.9).

---

## 4. Funktionsinventar nach Fachbereich

### 4.1 Firmen-/Objektverwaltung

- `App.renderFirmen`/`neueFirma`/`delFirma`/`openFirma` (Z. 2876–2896): CRUD für Firmen.
- `App.renderFirma`/`neuesObjekt`/`delObjekt`/`openObjekt` (Z. 2898–2949): CRUD für Objekte,
  inkl. Default-Vorgaben beim Neuanlegen (70/30-Heizschlüssel, Heizöl-Brennstoff-Skeleton).
- `App.openObjektAbrechnungen` (Z. 2952): öffnet die Abrechnungsjahr-Liste eines Objekts,
  ruft `migrateObjekt()` auf.
- `App.oTabStamm` (Z. 3182): Objektdaten-Tab — Liegenschaft, Bankverbindung, Heizungsvorgaben,
  Gesamtgrößen (Leerstandsbehandlung), Hinweistexte, Anschreiben-Vorlage, Stromzähler-Checkliste.

### 4.2 Abrechnungsjahre, Nutzer, Nutzerwechsel, Leerstand

- `App.neuesAbrechnungsjahr` (Z. 3055): dupliziert das letzte Jahr, setzt Nutzer-HKV auf 0
  zurück, rollt Brennstoffbestände (Restbestand → Anfangsbestand, siehe 6), setzt
  Kostenbeträge auf 0. Ruft danach `zeigeVzAnpassungsAssistent()` auf.
- `App._setAbrStatus`, `App.alleFreigeben`, `App._delAbrechnung`, `App.openAbrechnung`
  (Z. 2992–3054): Statuswechsel und Auswahl eines Abrechnungsjahres.
- `App.zeigeVzAnpassungsAssistent` / `vzAnpassungsVorschlaege` (Z. 934) /
  `vzAnpassungAnwenden` (Z. 944): Jahreswechsel-Assistent für neue Monats-VZ aus Vorjahressaldo.
- `App.oTabNutzer` (Z. 3247): Haupttabelle Nutzer/Nutzungseinheiten mit Filter- (11 Kategorien
  via `getNutzerIssues`, Z. 1374), Sortier- und Kompaktansicht-Optionen.
- `App.setN`, `setFlaeche`, `setScope`, `setAuszug`, `insertN`, `addN`, `delN`,
  `nutzerDetail` (Z. 3360–3672): Feld-/Zeilen-CRUD für Nutzer, inkl. automatischer
  Mandatsref→Block-Ableitung beim Ändern der internen Nummer.
- **Tagegenaue Zeiträume**: `bewohnteTage()` (Z. 682), `zeitraumTage()` (Z. 689),
  `monatlicheAnteile()` (Z. 690, für monatsanteilige VZ-Berechnung).
- **Leerstand**: `istLeerstand()` (Z. 750) — Kriterium ist eine Disjunktion aus drei Feldern
  (`leerstand`, `aktiv` enthält „leerstand", `mandatsref` enthält „leerstand"); Leerstandszeilen
  fließen nicht in Vorauszahlungssummen, ihr Kostenanteil trägt der Vermieter
  (`leerstandZeilenKosten` in `Engine.rechne`).
- **§9a-HeizKV-Schätzassistent**: `App.nutzerSchaetzen` (Z. 3456) — drei Schätzmethoden
  (flächenproportional, Blockdurchschnitt, Vorjahr×1,1), setzt `einheiten_geschaetzt` +
  `einheiten_schatz_grund`.
- `App.splitNachBloecke` (Z. 3546), `App.verteileUnscopedHeizkosten` (Z. 3572): Massenaktionen
  zum Aufteilen block-übergreifender Kostenpositionen auf einzelne Heizkreise.

### 4.3 Kostenarten, Buchungszuordnung, Umlageschlüssel

- `STANDARD_KOSTENARTEN` + `ensureStandardKostenarten` (Z. 1337): automatisches Anlegen der
  BetrKV-Pflichtpositionen je Abrechnungsjahr (Grundsteuer, Wasser, Abwasser, Heizungswartung,
  Schornsteinfeger, Beleuchtung Gemeinschaftsflächen, Versicherung, Müll, optional weitere).
  Warmwasser-Kostenart nur wenn mind. ein Heizkreis `hat_warmwasser`.
- `App.oTabKosten` (Z. 3673): Haupttabelle Kostenarten mit „Einfach"/„Details"-Ansicht,
  BetrKV-Kategorie-Autofill (`setKatPreset`), Standardkostenarten-Statusübersicht.
- `App.kostenBelege` (Z. 3947): Modal für Einzelbelege je Kostenart — Buchungsverknüpfung,
  Umlage-%-je-Beleg, Dateianhang, „extern bezahlt"-Bestätigung.
- `App.verschiebeBelegAlsLieferung` (Z. 4007): konvertiert einen fälschlich als
  Heizungs-Kostenart erfassten Beleg in eine echte Brennstoff-Lieferung (mit manueller
  Mengenerfassung, damit FIFO/CO₂ korrekt rechnen).
- **Umlageschlüssel-Berechnung** (in `Engine.rechne`, Z. 2541 `kpos`): je Kostenart wird ein
  Bezugswert (`dm2`, `dm2h`, `dpers`, `deinh`, `dwe`) ermittelt (`Engine.bezug`, Z. 2450) und
  daraus ein Preis je Einheit; `umlage_nach==='direkt'` verteilt nicht automatisch, sondern
  bleibt als `direktKostenSum` sichtbarer Blocker.
- `umlageProz`/`belegUmlageProz`/`umlageFaktor` (Z. 2354–2367): Umlagegrad-Kaskade
  Beleg > Kostenart, betragsgewichtet gemittelt.
- **Hauswart-Splitting**: `HAUSWART_VERTRAG_INFO`, `HAUSWART_SPLIT_STANDARD`,
  `istHauswartVertragsBuchung`, `hauswartSplitTemplates`, `hauswartVertragBuchungen/Summary/
  HinweisHtml/PdfBlock` (Z. 2281–2350): automatisches Aufteilen eines pauschalen
  Hausmeisterservice-Vertrags (fest hinterlegter Betrag/Anbieter) auf 5 Kostenarten nach
  festen Prozentsätzen (45/20/20/5/10 %).
- **BetrKV-Migrationen**: `migrateGrundsteuerGlobal`, `migrateBeleuchtungGlobal`,
  `migrateBeleuchtungName`, `migrateBetrKVNummerierung` (Z. 1856–1969) — konsolidieren
  historisch fehlerhaft nummerierte/verteilte Kostenarten einmalig (idempotent per Flag).

### 4.4 Heizkreise, Energiequellen, FIFO-Brennstoffbewertung

- `App.ensureHeizkreise` (Z. 4244): legt für jeden `Block` bei Bedarf einen `Heizkreis` an,
  inkl. Einmal-Migration alter Einzel-`brennstoff`/`co2`-Objekte nach B1.
- `App.oTabHeizung` (Z. 4305): Heizkreis-Editor — Block-Konfiguration, Erklär-Boxen
  (70/30-Topf vs. separat), Betriebsstrom-Status, je Heizkreis Brennstoff-/Energiequellen-
  Formular mit Lieferungstabelle.
- **FIFO-Bewertung**: `heizquelleKostenDetails()` (Z. 292) — sortiert Anfangsbestand +
  Lieferungen chronologisch, zieht den Restbestand vom Ende der Liste ab (Last-In bleibt im
  Bestand), berechnet Verbrauchsmenge und -kosten. Fallback „Direktkosten ohne Mengenbestand",
  wenn keine Menge vorhanden ist (reiner Betrag ohne FIFO).
- `heizquelleVollkosten()` (Z. 323), `heizkreisFifoHinweis()` (Z. 475),
  `heizquelleFifoKurzHtml()` (Z. 466): Aggregation/Anzeige der FIFO-Ergebnisse.
- `Engine.brennstoffVollkostenBlock`/`brennstoffVollkosten`/`brennstoffVerbrauchskosten`
  (Z. 2428–2449): Summierung über Heizkreise/Energiequellen, Verbrauchskosten =
  Vollkosten − CO₂-Kosten.
- **Hybrid-Heizkreis (B4)**: `defaultHeizquellen()` (Z. 273) legt zwei feste Quellen an
  (`wp_strom` mit CO₂-Faktor 0,380 kg/kWh, `gas` als Zusatz-/Spitzenlast).
- **Jahreswechsel-Rollover**: in `App.neuesAbrechnungsjahr` (Z. 3079–3100) — Restbestand des
  Vorjahres wird zum Anfangsbestand des neuen Jahres, bewertet zum Vorjahres-Durchschnittspreis
  (Gesamtwert/Gesamtmenge aller Lieferungen); Lieferungen werden NICHT übernommen.

### 4.5 Warmwasser (zentral/dezentral), Grund-/Verbrauchskostenaufteilung

- Aktivierung je Heizkreis über `hat_warmwasser` + `ww_anteil_proz` (18–70 %, §9 HeizKV-Grenzen).
- In `Engine.rechne` (Z. 2507–2521): `wwKosten = brennVerb * wwProz` wird **vor** dem
  70/30-Split aus den Brennstoffkosten herausgerechnet (`brennVerbOhneWW`); WW-Kosten werden
  nach Personenzahl (`dPers_blk`, zeitanteilig) verteilt (`wwPreisProPers`).
  Dezentrale Warmwasserbereitung wird implizit dadurch abgebildet, dass `hat_warmwasser=false`
  bleibt — es gibt keine eigene Kennzeichnung „dezentral", das Feature „läuft dann einfach nicht".
- **Grund-/Verbrauchskosten (30/70, konfigurierbar)**: `verbrauch_proz`/`grund_proz` auf
  Objekt- oder Heizkreis-Ebene, geprüft auf Summe=100% und Bereich 50–70% Verbrauch
  (`heizkreisChecks`, Z. 1653, §7 Abs.1 HeizKV).
- `grundkosten_umlage` (`m2_nf` vs. `m2_nf_hzg`) bestimmt die Bezugsfläche für den Grundanteil.

### 4.6 CO₂-Berechnung (BEHG-Stufenplan) und Vermieter-/Mieteranteil

- `Engine.co2BilanzBlock` (Z. 2403): kg CO₂ = verbrauchte Energie (kWh, aus FIFO-Verbrauch ×
  Heizwert) × CO₂-Faktor; CO₂-Kosten = kg/1000 × Preis (€/t); Kennwert (kg/m²·a) auf Jahr
  hochgerechnet (`×365/periodentage`); `modus==='manuell'` überschreibt komplett mit fest
  eingetragenem `abgabe`/`aufteilung_vermieter_proz`.
- `co2MieterAnteil()` (Z. 834): 10-Stufen-Modell nach CO₂KostAufG §5 Anlage
  (< 12 kg/m²a → 100 % Mieter … ≥ 52 kg/m²a → 5 % Mieter / 95 % Vermieter).
- `Engine.co2Bilanz` (Z. 2434): aggregiert alle Blöcke zu einer Gesamtbilanz (für Kontrolle/
  Legacy-Anzeige); Gesamt-Kennwert und -Mieteranteil sind Durchschnittswerte über die Blöcke.
- `App.oTabCo2` (Z. 4484): Stufentabelle + Block-Übersicht.
- `co2NachweisDaten/-Html/-Pdf` (Z. 5625–5675): CO₂-Transparenzpflichtangaben nach
  §7 Abs. 3 CO₂KostAufG je Mieter-PDF.
- `co2Checks` (Z. 1683): Plausibilitätsprüfung (Preis vs. BEHG-Stufenplan-Erwartungswert je Jahr).

### 4.7 Vorauszahlungen, Kontrollsummen, Rundungslogik

Siehe eigene Abschnitte 5 (Rechenweg) und 6 (Rundungsstellen) unten.

### 4.8 Validierungen/Prüfungen

Zentrale Sammelfunktion `buildFreigabeChecks(o,e,rp)` (Z. 1804) kombiniert:

| Prüfgruppe | Funktion | Zeile |
|---|---|---|
| Formelle Mindestanforderungen | `formelleMindesanforderungen` | 1716 |
| Abrechnungszeitraum-Plausibilität | `abrechnungszeitraumChecks`/`pruefeJahrZeitraum` | 1699/1433 |
| IBAN-Format | `ibanChecks` | 1704 |
| Nutzer-Einzelprüfungen | `getNutzerIssuesForObject` | 1449 |
| Nutzerwechsel-Überlappung | `nutzerwechselChecks` | 1774 |
| Nutzer außerhalb Zeitraum | `zeitraumNutzerChecks` | 1792 |
| Standardkostenarten vollständig? | `pruefeStandardKostenarten` | 1466 |
| Grundsteuer je Haus | `grundsteuerChecks` | 1642 |
| Heizkreis-Plausibilität (70/30-Grenzen, Hybrid-Quellen) | `heizkreisChecks` | 1653 |
| CO₂-Plausibilität | `co2Checks` | 1683 |
| Belegstatus | `belegChecks`/`belegStatus` | 1484/1421 |
| Stromzähler-Checkliste | `stromzaehlerChecks` | 1578 |
| Negative Beträge | `negativeBetragChecks` | 1768 |
| Unübliche Umlageschlüssel | `schluesselHinweise` | 1726 |
| Kostensteigerung ggü. Vorjahr | `kostensteigerungChecks` | 1746 |
| Rechtsprüfung (BGB/BetrKV/HeizKV-Paragraphen) | `rechtsPruefung` | 761 |
| Kontrolldifferenz/unzugeordnete Heiz-/Direktkosten | inline in `buildFreigabeChecks` | 1824–1828 |
| Belege ohne Buchungslink | `kostenOhneBuchungslink`/`belegLinkFehlt` | 1393/1392 |
| Verwaiste Buchungszuordnungen | `syncOrphansVon` | 2144 |

Fehlerklassen: `error` (blockiert Freigabe/PDF-Warnbanner), `warn`, `info` — deckt sich
konzeptionell mit Masterplan-Abschnitt 7.1. `abrechnungBlocker(o,e,rp)` (Z. 751) filtert nur
die `error`-Einträge für den harten Freigabe-Stopp (`alleFreigeben`, `pdfFreigabeOk`).
`check()`/`checkSort()` (Z. 1443/1444) sind die generischen Bauklötze.

### 4.9 Freigabestatus/-workflow

- Statuswerte (String, kein Enum-Typ im Code): `Entwurf` → `Prüfung offen` → `PDF bereit` →
  `abgeschlossen` (bzw. `veraltet`). Übergänge sind **nicht hart erzwungen** — die UI bietet
  passende Buttons an (Z. 4560–4561), der Nutzer kann aber jederzeit per Dropdown jeden Status
  direkt setzen (`_setAbrStatus`, Z. 2992). Einzige harte Regel: „abgeschlossen" ohne
  `versanddatum` erfordert eine Bestätigung (`confirm()`-Dialog).
- `App.alleFreigeben` (Z. 3004): setzt alle Nutzer auf `_abrStatus='PDF bereit'` und die
  Abrechnung auf Status `PDF bereit` — blockiert hart bei vorhandenen `error`-Checks.
- `App.pdfFreigabeOk` (Z. 4077): vor jeder PDF-Erzeugung neu berechnet, sammelt
  `abrechnungBlocker` für den PDF-Warnbanner (`_pdfBlockers`), schreibt einen
  Protokolleintrag — **blockiert die PDF-Erzeugung selbst nicht** (nur eine sichtbare
  „VORABVERSION"-Warnbox im PDF, siehe `pdfEinzelDoc` Z. 5981).
- Jede Statusänderung/PDF-Erstellung/Stromzähler-Bestätigung wird in `abr._protokoll[]`
  protokolliert (append-only Audit-Trail, kein Undo außer manuellem „Protokoll leeren").

### 4.10 PDF-Erzeugung

Bibliothek: `pdfmake` (CDN, Zeile 7/8), dynamische Dokumentdefinitionen als JS-Objekte.

| Dokument | Erzeuger-Methode | Download-Trigger |
|---|---|---|
| Einzelabrechnung (ein Mieter) | `pdfEinzelDoc` (Z. 5931) | `pdfEinzel` (Z. 6098) |
| Sammel-PDF (Deckblatt + Kontrollseite + alle Einzelabrechnungen) | `pdfSammelDoc` (Z. 6133) | `pdfAlle` (Z. 6099) |
| Einzel-PDFs als ZIP (ein File je Mieter) | `pdfEinzelDoc` je Nutzer, gebündelt via JSZip | `pdfAlleZip`/`_pdfZipFertig` (Z. 6107/6125) |
| Eigentümer-Report (interne Vermieter-Kostenübersicht, nicht für Mieter) | `pdfEigentuemerDoc` (Z. 6205) | `pdfEigentuemer` (Z. 6201) |
| Gesamt-Kostenaufstellung (Kostenarten + Mieter-Salden) | `pdfGesamtDoc` (Z. 6242) | `pdfGesamt` (Z. 6270) |

Bausteine, die in mehreren Dokumenten wiederverwendet werden:
`_kopf()` (Z. 5921, Brief-Kopfzeile), `co2NachweisPdf` (Z. 5663, CO₂-Pflichtangaben),
`pdfTechemSummenblock`/`pdfTechemFormelTabelle`/`pdfTechemAblesewerte`/
`pdfTechemKostenaufstellung` (Z. 5703–5860, an Techem-Abrechnungen angelehnte
Formel-/Ablesewerte-/Kostenaufstellungstabellen), `hauswartVertragPdfBlock` (Z. 2343).

Das Einzel-PDF ist als DIN-5008-Fensterbrief mit absolut positionierten Elementen
(Anschriftfeld, Datum, Betreff) aufgebaut (Z. 5967 ff.) — enthält optional ein Serien-
anschreiben mit Platzhalter-Ersetzung (`anschreibenText()`, Z. 723) und bei offenen
`error`-Checks eine rot hinterlegte „VORABVERSION – PRÜFPUNKTE OFFEN"-Warnbox.

`abrHTML()` (Z. 5862) ist die **HTML-Voransicht** derselben Einzelabrechnung (für das Modal
„Ansehen", `App.zeigeAbr`, Z. 5617) — eine separate, teilweise abweichende Implementierung
der gleichen Fachlogik parallel zu `pdfEinzelDoc` (siehe Risiko 8.5).

### 4.11 JSON-Import/-Export, Schema-Migration-Handling

- `Store.exportJson` (Z. 1265): Download des kompletten `Store.data` als
  `nk-daten_<timestamp>.json`.
- `Store.importJson` (Z. 1272): Größenlimit 25 MB, `validateImportData()` (Z. 653,
  Struktur-/Prototype-Pollution-Schutz via `rejectDangerousKeys`, Z. 646), Kennzahlen-Diff
  gegen aktuellen Stand (`datenKennzahlen`, Z. 674) mit Bestätigungsdialog, automatisches
  Sicherheits-Backup vor Überschreiben, danach `migrateObjekt`+`syncBuchungenForObjekt`
  je Objekt.
- **Migrationsfunktionen** (alle idempotent über Flags/Inhalts-Checks, siehe Abschnitt 3.2/4.3):
  `migrateObjekt` (Z. 2008, Dispatcher), `migrateGrundsteuerGlobal` (1856),
  `migrateBeleuchtungGlobal` (1887), `migrateBeleuchtungName` (1915),
  `migrateBetrKVNummerierung` (1952), `migrateStromzaehlerSeed` (2000).
- **Schema-Versionsschutz**: `APP_SCHEMA_VERSION=3` (Z. 903); beim Laden wird eine Datei mit
  höherer Version als blockierend markiert (`Store._versionsWarnung`, Z. 990) — Auto-Speichern
  wird deaktiviert, um neuere Felder nicht zu überschreiben (`writeFile` wirft
  `version_blocked`, Z. 1146). Es gibt **keine Vorwärts-Migration von v1/v2** im Code — nur
  das strukturelle `migrateObjekt` für das objektinterne Root→`abrechnungen[]`-Schema.
- Es existiert **kein separates „Legacy-Import"-Feature für fremde Formate** — Import/Export
  ist ausschließlich das eigene JSON-Schema dieser App-Version.

### 4.12 Persistenz: localStorage, IndexedDB, File System Access API/OneDrive

- **localStorage** (`LS_KEY='nk_abrechnung_v3'`, Z. 894): Immer aktiv, Fallback-Ebene und
  Fail-Safe-Kopie. `Store.saveLocal()` (Z. 1112).
- **File System Access API** (`window.showOpenFilePicker`/`showSaveFilePicker`, nur
  Chrome/Edge): eine ausgewählte lokale/OneDrive-Datei `nk-daten.json` als „Auto-Speichern"-
  Ziel. Handle wird in IndexedDB persistiert (`idbSet('datafile', h)`, Z. 906) und beim
  nächsten Start automatisch reaktiviert (`Store.reconnect`, Z. 1013).
- **IndexedDB** (`IDB_DB='nk_abrechnung'`, zwei Object Stores `handles`/`snapshots`, Z. 904–911):
  Speichert den Datei-Handle sowie eine automatische Snapshot-Historie
  (`snapshotSpeichern`/`snapshotsZuBehalten`, Z. 1174/915 — Rotationsregel: letzte 5
  Speicherungen + max. 1/Tag der letzten 14 Tage).
- **Konfliktschutz**: Vor jedem automatischen Schreiben wird der aktuelle Dateiinhalt gegen
  den zuletzt bekannten Stand (`_diskStamp`) verglichen; ist die Datei extern neuer, wird
  **nicht** geschrieben, sondern ein Konflikt-Banner gezeigt (`showKonfliktBanner`, Z. 1050);
  der Nutzer kann bewusst überschreiben oder neu laden.
- **Mehrfach-Tab-Erkennung** über `BroadcastChannel` (`initTabWatch`, Z. 1070) — reine
  Frühwarnung, kein technischer Schutz.
- **Initiale Ladepriorität**: Datei (falls per `fetch('nk-daten.json')` erreichbar) gewinnt
  gegen localStorage, wenn ihr `gespeichert`-Zeitstempel neuer oder gleich ist (Z. 979–985).
  Sind beide Rohquellen kaputt (nicht parsebares JSON), wird **nicht** automatisch mit
  Demo-Daten überschrieben, sondern ein blockierender Fail-Safe-Dialog gezeigt
  (`showInitFehlerDialog`, Z. 2708) mit Optionen: Backup importieren, defekten Rohtext
  herunterladen, oder bewusst mit leeren Daten neu starten.
- `sollteVorUnloadWarnen()` (Z. 956) + `beforeunload`/`pagehide`-Handler (Z. 2756–2759):
  Verlustschutz beim Schließen des Tabs (Flush + Browser-Warnung bei ungesicherten Änderungen).

### 4.13 Ergänzende migrationskritische Funktionsgruppen

- **Berechnungs- und Freigabe-Orchestrierung**: `App.ensureErg`, `App.berechne`,
  `App.oTabFreigabe` und `buildFreigabeChecks` verbinden Cache-Invalidierung,
  `Engine.rechne`, Blocker und Ausgabefreigabe. Ziel: `packages/core/allocation`,
  `packages/validators` und eine dünne UI-Schicht in `apps/web`.
- **Buchungs-Pipeline**: CSV-Parsing, Klassifizierung, Jahres-/Kostenartauflösung, Splits,
  Heizkreis-/Lieferungsübernahme und Linkstatus bilden einen zusammenhängenden Workflow
  (`buchParseCSV` bis `oTabBuchungen`). Ziel: `packages/import-export`,
  `packages/core/allocation`, `packages/core/heating`, `packages/validators`.
- **Kosten, Grundsteuer und Belege**: Statuswechsel von Standardkostenarten,
  Grundsteuer-Scope, externe Zahlungsbegründung und Dateianhänge verändern die fachliche
  Verwendbarkeit von Kosten. Ziel: `packages/core/allocation`, `packages/validators`,
  `packages/import-export`.
- **Heizung, Energiequellen, Lieferungen und Zähler**: Quellenauflösung, Blockpflege,
  Rechnungs-/Lieferungszuordnung und Schätzungsübernahme sind gemeinsam zu migrieren.
  Ziel: `packages/core/heating` mit UI in `apps/web`.
- **Persistenz und Wiederherstellung**: IndexedDB, File System Access, Autosave,
  Konfliktauflösung, Snapshot-Rotation und Restore sind ein eigener Adapterbereich.
  Ziel: `packages/persistence`; keine Fachlogik in Browser-Adaptern.
- **Anhänge, CSV und PDF**: partieller Spreadsheet-Formelpräfix-Guard, Belegdateien,
  Tabellenexport und die
  verschiedenen Nachweis-/PDF-Varianten sind getrennte Ausgabeadapter. Ziel:
  `packages/import-export` und `packages/pdf`.

Der Coverage-Anhang in Abschnitt 10 ergänzt alle migrationsrelevanten Definitionen, die in
den Detailabschnitten nicht bereits namentlich vorkommen. Reine DOM-, Label- und
Format-Helfer sind dort nur dann enthalten, wenn sie Daten, Sicherheit oder Fachverhalten
beeinflussen.

---

## 5. Rechenwege im Detail: `Engine.rechne(o)` (Zeile 2466–2681)

Ablauf (Aufrufreihenfolge, jeweils mit Zwischenergebnis):

1. **Vorbedingung**: `o.zeitraum.von/bis` muss gesetzt sein, sonst `throw`.
2. `bz = Engine.bezug(o)` (Z. 2450) — objektweite Bezugsgrößen (`m2`, `m2h`, `pers`, `einh`,
   `we`) als zeitanteilige Summe über alle Nutzer, plus „Verteiler-Nenner" `d*` (Fallback auf
   `o.gesamt.*`, falls größer als die erfasste Summe → Differenz trägt der Vermieter).
3. Kosten-Vorfilterung: `umlageKosten` (alles außer `NICHT_UML`), `interneKostenSum`
   (Summe `NICHT_UML`), `direktKostenSum` (Summe `umlage_nach==='direkt'`), `verteilbareKosten`
   (Rest).
4. **Betriebsstrom-Budget** (Z. 2480–2485): `bsBudget` = Summe der mit
   `betriebsstrom_abzug` markierten Nicht-Heizungs-Kostenarten (umlagegewichtet);
   `bsIntended` = Summe über alle Blöcke aus Brennstoff-Verbrauchskosten × Block-Betriebsstrom-%;
   `bsFactor = min(1, bsBudget/bsIntended)` — begrenzt die Umbuchung auf tatsächlich
   verfügbares Budget (keine Phantomkosten).
5. **Je Heizkreis-Block** (Schleife über `getBloecke(o)`, Z. 2490–2529):
   - Block-Nutzer filtern (`blockVonRef`), block-eigene Bezugsgrößen `bz_blk`.
   - `bVoll = brennstoffVollkostenBlock(hk)` (FIFO-Verbrauchswert), `cb = co2BilanzBlock(...)`.
   - `brennVerb = bVoll − cb.kosten_eur` (Brennstoffkosten ohne CO₂-Anteil).
   - `heizBetrieb_blk` = Summe der Kostenarten `typ==='heizung'` mit `scope_key===Block`.
   - `heizBetriebLohn_blk` = §35a-Lohnanteil dieser Heizungs-Betriebskosten.
   - `betriebsstrom_blk = brennVerb × bsProz × bsFactor`.
   - **Warmwasser-Abzug**: `wwKosten = brennVerb × wwProz`; `brennVerbOhneWW = brennVerb − wwKosten`.
   - `heizGesamt_blk = brennVerbOhneWW + heizBetrieb_blk + betriebsstrom_blk` (= 70/30-Topf).
   - `grundK_blk = heizGesamt_blk × gProz`, `verbrK_blk = heizGesamt_blk × vProz`.
   - Preise je Bezugseinheit: `preisGrund = grundK_blk / bRef`, `preisVerbr = verbrK_blk / eRef`.
   - WW-Preis je Person: `wwPreisProPers = wwKosten / dPers_blk`.
   - Ergebnis in `blockHeiz[blk.id]` abgelegt; Summen `heizGesamtAlle`, `brennVerbAlle`,
     `heizBetriebAlle`, `betriebsstromAlle` akkumuliert.
6. **Fallback für nutzerlose/block-lose Restkosten** (Z. 2530–2538): Heizungskosten ohne
   `scope_key` (`heizBetriebUnscoped`) und übrig gebliebener Brennstoff-Verbrauch
   (`brennVerbFallback = brennstoffVerbrauchskosten(o) − brennVerbAlle`) werden pauschal
   (objektweite Bezugsgrößen) verteilt — sichtbar als `heizUnscopedWarn`, Vermieteranteil
   falls kein Fallback-Nutzer.
7. **Betriebs-/Wasserkosten je Kostenart** (`kpos`, Z. 2541–2559): pro Kostenart Umlagebetrag
   (`betragEff = betrag × umlageFaktor`), ggf. Betriebsstrom-Abzug (max 0), Preis je
   Bezugseinheit anhand `umlage_nach` (nur bei nicht-`direkt`).
8. `cbGesamt = Engine.co2Bilanz(o)` — objektweite CO₂-Aggregation für Kontrollzwecke.
9. **Je Nutzer** (`o.nutzer.map(...)`, Z. 2563–2645):
   - Zeitfaktor `zf = tage/zTage` (tagegenau, `bewohnteTage`).
   - Block-Zuordnung → block-spezifische Preise (`pg`, `pv`, `pco2`) oder Fallback-Preise.
   - Heizkosten-Grund-/Verbrauchsposition (`hGrund`, `hVerb`) mit textuellem Schlüssel-Nachweis
     (`schlGrund`, `schlVerb` für PDF/UI).
   - Warmwasser-Position (falls Block `hatWW`), nach Personen × Zeitfaktor.
   - **§12-HeizKV-15%-Kürzung** (Z. 2604–2612): falls `einheiten_geschaetzt &&
     kuerzung12_anwenden`, werden Heiz-/WW-Positionen dieses Nutzers direkt um 15 % gekürzt
     (Differenz trägt implizit der Vermieter über den Kontroll-Mechanismus).
   - §35a-Lohnanteil proportional zum Kostenanteil des Nutzers am Block-Heiztopf.
   - Betriebs-/Wasserkosten je `kpos` (nur wenn Nutzer im passenden Scope liegt).
   - CO₂-Betrag = `preisCo2 × einheiten`.
   - `summe = Σ pos.betrag + co2Betrag`; `vz = vorauszahlungGesamt(n,z)`; `saldo = summe − vz`.
   - `ampel`: `gruen`|`gelb` (Warnungen vorhanden)|`rot` (Summe negativ/nicht endlich).
10. **Kontrollrechnung** (Z. 2646–2680):
    - `erfassteKosten = brennstoffVollkosten(o) + heizBetrieb + heizFreianteil + betriebWasserSum`.
    - `gesamtkosten` = Summe `summe` aller Nicht-Leerstand-Nutzer.
    - `vermieterKosten = co2Verm + leerstand + heizUnscopedVermieter + freianteilVermieter`.
    - `kontrollDiff = erfassteKosten − gesamtkosten − vermieterKosten` (Soll: 0, siehe
      Abschnitt 6/Masterplan 6.3).
    - Rückgabeobjekt enthält u. a. `nutzer` (nur bewohnte Einheiten, für PDF/Anzeige) und
      `alleNutzer` (inkl. Leerstand, für interne Kontrolle).

**Wichtig für die Migration**: `Engine.rechne` liest indirekt globale Helfer (`getBloecke`,
`blockVonRef`, `nutzerScopeMatches`, `umlageFaktor`, `betriebsstromStatus` →
`Engine.brennstoffVerbrauchskosten`) und mutiert `o` nicht sichtbar, ruft aber selbst wieder
`Engine`-Methoden rekursiv auf (`co2BilanzBlock` innerhalb der Block-Schleife, `co2Bilanz`
separat danach — **doppelte Berechnung derselben CO₂-Bilanz** mit potenziell leicht
abweichenden Zwischenwerten, siehe Risiko 8.3).

---

## 6. Rundungsstellen

Geldbeträge werden **durchgängig als JavaScript-Fließkommazahlen in Euro** gehalten (nicht in
Cent) — das ist ein fundamentaler Unterschied zum Zielmodell (Masterplan 5.3/2.5) und muss bei
der Migration explizit adressiert werden (siehe Risiko 8.6). Innerhalb von `Engine.rechne()`
selbst wird **nirgends gerundet** — alle Zwischenwerte bleiben volle Fließkomma-Präzision.
Ein Quelltext-Scan auf `Math.round`, `Math.ceil`, `Math.floor` und `.toFixed(` ergibt exakt
33 Quellzeilen; alle 33 sind in der folgenden Tabelle erfasst:

| Zeile | Kontext | Verfahren |
|---|---|---|
| 687 | `bewohnteTage()` | `Math.round` auf ganze Tage |
| 689 | `zeitraumTage()` | `Math.round` auf ganze Tage |
| 700 | `monatlicheAnteile()` | `Math.round` auf ganze Tage je Monat (Zwischenschritt) |
| 769 | `rechtsPruefung()` (Fristberechnung) | `Math.round` auf ganze Tage (nur Anzeige) |
| 937 | `vzAnpassungsVorschlaege()` | `Math.round(...×2)/2` — Rundung der VZ-Empfehlung auf 0,50 € |
| 1446 | `co2StufeLabel()` | `Math.round` auf ganze Prozent (nur Anzeige) |
| 1868 | `migrateGrundsteuerGlobal()` | `Math.round(...×100)/100` beim Zusammenführen mehrerer Grundsteuer-Positionen |
| 1901 | `migrateBeleuchtungGlobal()` | `Math.round(...×100)/100` beim Zusammenführen der Beleuchtungspositionen |
| 2065 | `removeBuchungRefs()` | `Math.round(...×100)/100` — Kostenart-Betrag neu aus Belegsumme abgeleitet |
| 2078 | `mengeAusBuchungstext()` | `Math.round(...×1000)/1000` — Tonnen→kg-Umrechnung (Mengeneinheit, nicht Geld) |
| 2242 | `syncBuchungenForObjekt()` | `Math.round(...×100)/100` — Kostenart-Betrag aus Belegsumme |
| 2673 | `Engine.rechne()` (Warntext) | `.toFixed(0)` — unzugeordnete Heizungs-Betriebskosten nur für die Anzeige auf ganze Euro |
| 3088/3099 | `App.neuesAbrechnungsjahr()` (Bestandsrollover) | `Math.round(...×100)/100` — Anfangsbestandswert des Folgejahres |
| 3467/3469/3476 | `App.nutzerSchaetzen()` | `Math.round` auf ganze HKV-Einheiten (drei Schätzmethoden) |
| 3587 | `App.verteileUnscopedHeizkosten()` | `Math.round(...×100)/100` je Block-Anteil, letzter Block erhält Rest via `.toFixed(2)` (Restcent-Zuweisung an letzte Position) |
| 3666 | `App.nutzerDetail()` (Fristanzeige) | `Math.ceil` auf verbleibende ganze Tage |
| 3698 | `App.oTabKosten` (Anzeige) | `Math.round(...×1000)/10` — Umlage-% auf eine Nachkommastelle |
| 3824 | `exportBelegliste()` | `.toFixed(2)` — Geldbeträge für den CSV-Export mit zwei Dezimalstellen |
| 4031 | `verschiebeBelegAlsLieferung()` | `Math.round(...×100)/100` — Kostenart-Betrag nach Entfernen eines Belegs |
| 4059 | `stromzaehlerZuordnung()` (Übernahme-Link) | `.toFixed(2)` — Vergleichsbetrag als Formularwert mit zwei Dezimalstellen |
| 4136 | `App.setStromzaehlerFeld`-Umfeld (Rechnung-Zähler-Zuordnung) | `Math.round(...×100)/100` |
| 4188 | `heizkreisZaehler()` (Übernahme-Link) | `.toFixed(2)` — Vergleichsbetrag als Formularwert mit zwei Dezimalstellen |
| 4302 | `App._autoAnfWert()` | `.toFixed(2)` — Anfangsbestandswert = Menge×Preis |
| 4528 | `App.oTabErgebnis()` | `Math.ceil(.../5)×5` — empfohlene monatliche Vorauszahlung auf den nächsten 5-Euro-Schritt aufrunden |
| 4861/4862/4865 | `App._buchSplitAdd`/Hauswart-Split | `Math.round(total×proz)/100` je Split, `Math.round((rest−raw)×100)/100` Restverfolgung, letzter Split erhält den tatsächlichen Rest |
| 4924 | Buchungs-Restbetrag-Berechnung | `Math.round(...×100)/100 × Math.sign(...)` |
| 4939 | `sp.betrag` bei Split-Erzeugung | `Math.round(...×p×sign)/100` |
| 5813 | `pdfTechemKostenaufstellung()` (Anzeige) | `Math.round` auf ganze Prozent (Grund-/Verbrauchsanteil-Anzeige) |

Die PDF-CO₂-Stufenermittlung um Zeile 6057 enthält keine Rundung, sondern eine
Stufen-`if`-Kette (Doppelimplementierung von `co2MieterAnteil`, siehe Risiko 8.3), und zählt
daher nicht zu den 33 Rundungsquellzeilen.

Für die **Anzeige** (nicht Speicherung) wird durchgängig `fmtEuro()` (Z. 615,
`Intl.NumberFormat('de-DE', {style:'currency'})`) bzw. `fmtNum()` (Z. 616) verwendet — diese
runden nur die Darstellung, nicht den gespeicherten Wert.

**Kontrollsummen-Toleranz**: Der Freigabe-Check verwendet `0.5` € als Toleranzschwelle für
`kontrollDiff` (Z. 1825: `>0.5 || <-0.5`), nicht die im Masterplan (Abschnitt 6.3) geforderten
0,01 €. Auch die PDF-Anzeige der Kontrollsumme (Z. 6264) verwendet eine Toleranz von `0.02`.
Dies ist ein bewusster Unterschied zur Zielvorgabe und muss im Ziel-System entweder
übernommen oder als geänderte fachliche Regel dokumentiert und freigegeben werden (siehe
Masterplan 2.6/12.1 Punkt 3).

---

## 7. Mapping auf Zielarchitektur

| Fachbereich (Abschnitt 4) | Ziel-Package (Masterplan 4.2) | Bemerkung |
|---|---|---|
| Firmen-/Objektverwaltung, Nutzer/Nutzerwechsel/Leerstand, Kostenarten/Buchungszuordnung/Umlageschlüssel, Heizkreise/FIFO, Warmwasser, CO₂, Vorauszahlungen/Kontrollsummen | `packages/core` (`calculation/`, `allocation/`, `heating/`, `co2/`, `periods/`) | Die eigentliche fachliche Rechenlogik von `Engine` + zugehörige reine Helferfunktionen (`bewohnteTage`, `zeitraumTage`, `vorauszahlungGesamt`, `heizquelleKostenDetails`, `co2MieterAnteil`, `umlageFaktor` usw.) |
| Rundungslogik (Abschnitt 6) | `packages/core/rounding` | Aktuell über die gesamte Datei verstreut — muss zentralisiert werden; Cent-Umstellung ist eine fachliche Entscheidung mit ADR-Bedarf (siehe Risiko 8.6) |
| Datenmodell-Entitäten (Abschnitt 3), Schema-Version, Feldkonventionen | `packages/schema` | inkl. der impliziten Konventionen wie `mandatsref`-Format, `heizkreis_id`-Format `blockId:quelleId` |
| Migrationsfunktionen (`migrateObjekt`, `migrateGrundsteuerGlobal`, `migrateBeleuchtungGlobal`, `migrateBetrKVNummerierung`, `migrateStromzaehlerSeed`, Schema-Versionsschutz) | `packages/schema/migrations`, `packages/import-export/legacy-v3` | Diese Funktionen sind bereits fachlich „Legacy-Migrationen" im Sinne von Masterplan 9.2, auch wenn sie aktuell innerhalb derselben Version 3 laufen |
| Validierungen/Prüfungen (Abschnitt 4.8) | `packages/validators` (`formal/`, `legal/`, `plausibility/`) | `formelleMindesanforderungen`+`ibanChecks` → `formal`; `rechtsPruefung` → `legal`; Rest → `plausibility` |
| Freigabestatus/-workflow (Abschnitt 4.9) | `packages/validators` (Statuslogik) + `packages/core` (Statusübergänge als reine Funktion) | Aktuell UI-getrieben (`App._setAbrStatus`), muss von der UI entkoppelt werden |
| JSON-Import/-Export, Schema-Migration-Handling (Abschnitt 4.11) | `packages/import-export` (`json/`, `legacy-v3/`, `backup/`) | inkl. `validateImportData`, `datenKennzahlen`-Diff-Vorschau, Sicherheits-Backup-vor-Import |
| Persistenz: localStorage/IndexedDB/File-System-Access (Abschnitt 4.12) | `packages/persistence` (`adapters/`, `indexed-db/`, `file-system/`, `memory/`) | Konfliktschutz- und Snapshot-Logik (`_diskStamp`, `snapshotsZuBehalten`) ist eigenständige, reine Teillogik und sollte separat testbar bleiben |
| PDF-Erzeugung (Abschnitt 4.10) | `packages/pdf` (`statements/`, `summaries/`, `templates/`) | `pdfEinzelDoc`→`statements`, `pdfSammelDoc`/`pdfGesamtDoc`/`pdfEigentuemerDoc`→`summaries`, Techem-/CO₂-/Hauswart-Bausteine→`templates` |
| UI-Rendering (`App.render*`, `oTab*`, Modal-Handling, Formularbindung) | `apps/web` | Komplette Neuimplementierung als React-Komponenten; keine fachliche Logik übernehmen, nur Interaktionsfluss/Navigation als Vorlage |
| Objekt-/Firmenspezifische Konstanten (Block-Seed Z. 499, `STROMZAEHLER_SEED`, `HAUSWART_VERTRAG_INFO`, `buchAutoKlassifiziere`-Regeln) | **Nirgends 1:1 übernehmen** — siehe Risiko 8.1 | Müssen als konfigurierbare Stammdaten (Mandant/Objekt-Ebene) neu modelliert werden, nicht als Code-Konstanten |

---

## 8. Risiken und unklare Bereiche

### 8.1 Sanitisierte, aber noch nicht abschließend anonymitätsgeprüfte Baseline

Die aktuelle GitHub-Baseline wurde nach einem Datenschutzvorfall aus der produktiven App
abgeleitet. Dabei wurden Kontakt-, Seed-, Zuordnungs- und Klassifizierungswerte bereinigt.
Die Bereinigung ist jedoch noch nicht als vollständige Anonymisierung nachgewiesen; einzelne
real wirkende operative Identifikatoren oder alte Mandats-/Ortstokens können weiterhin
vorhanden sein. Die Baseline darf daher nicht öffentlich gestellt und nicht als Quelle
produktiver Stammdaten verwendet werden.

Die Eingriffe betreffen unter anderem `seedData()`, `STROMZAEHLER_SEED`, den Block-Seed
in Z. 499,
`HAUSWART_VERTRAG_INFO` und Regeln in `buchAutoKlassifiziere()`. Sie waren nicht rein
textuell: In diesen Bereichen können sich Zuordnungen, Vorschläge und anderes Verhalten von
der ausschließlich lokal aufbewahrten produktiven Original-App unterscheiden. Die
GitHub-Datei ist deshalb lediglich die unveränderlich geschützte **Migrationsbaseline**, kein
byte- oder verhaltensgleiches Produktivabbild.

Produktive Werte gehören ausschließlich in lokale `private-data/`-Bestände bzw. eine
künftige Datenbank, niemals in Code, Dokumentation, Fixtures oder Git-Historie. Fachliche
Vergleiche mit dem Produktivoriginal erfolgen ausschließlich lokal; weder Eingaben noch
Ergebnisse dürfen nach GitHub übertragen werden.

**Restrisiko:** Geschlossene Pull-Request-Refs und serverseitige Cache-/Commit-Objekte der
verworfenen Historie können weiterhin erreichbar sein. Das Repository bleibt privat, bis
GitHub Support die Dereferenzierung, Cached-View-Bereinigung und Garbage Collection
bestätigt hat und zusätzlich eine dokumentierte Inhalts-/Denylist-Prüfung der gesamten dann
erreichbaren Historie bestanden ist.

### 8.2 Kein echtes Schema / keine Laufzeitvalidierung der Fachdaten

`validateImportData()` (Z. 653) prüft nur grobe Struktur (Arrays vorhanden, keine
`__proto__`-Injection) — es gibt **keine Feldvalidierung** (Typen, Pflichtfelder, Wertebereiche)
beim Import oder bei jeder Dateneingabe. Viele „Pflicht"-Charakterisierungen in Abschnitt 3
dieser Datei sind aus Prüf-/Rechtslogik abgeleitet (was fehlt, erzeugt eine Warnung), nicht aus
echten Schema-Constraints. Die Migration nach `packages/schema` mit Zod o. ä. wird daher
zwangsläufig Fälle aufdecken, die in der Praxis vorkommen können, aber im Legacy-Code
stillschweigend toleriert wurden (z. B. `betrag` als String, `null`, leerer String).

### 8.3 Doppelte/leicht abweichende Implementierungen derselben Fachlogik

- **CO₂-Stufenmodell**: `co2MieterAnteil()` (Z. 834, zentrale Funktion) vs. inline
  `stufeNr`-Berechnung in `abrHTML()` (Z. 5879) und `pdfEinzelDoc()` (Z. 6057) — dreifach im
  Code dupliziert (funktional identisch, aber als separate `if`-Ketten geschrieben statt einer
  gemeinsamen Funktion). Risiko: künftige Gesetzesänderungen am Stufenmodell müssten an drei
  Stellen synchron gepflegt werden.
- **Einzelabrechnungs-Darstellung**: `abrHTML()` (HTML-Vorschau) und `pdfEinzelDoc()`
  (PDF-Dokument) sind zwei unabhängige Implementierungen derselben fachlichen Darstellung mit
  eigenen Rundungs-/Formatierungspfaden. Bei der Migration sollte es nur noch eine
  Quelle der Wahrheit geben (ein Berechnungsergebnis, zwei Renderer/Views).
- **CO₂-Bilanz doppelt berechnet**: In `Engine.rechne()` wird `co2BilanzBlock` einmal je Block
  innerhalb der Hauptschleife aufgerufen und danach `Engine.co2Bilanz(o)` (Z. 2561) erneut
  aufgerufen, was **erneut über alle Blöcke iteriert und `co2BilanzBlock` ein zweites Mal
  aufruft**. Funktional konsistent (reine Funktion, gleiche Eingaben), aber unnötige doppelte
  Berechnung — Performance-relevant bei vielen Blöcken/Aufrufen, und ein Hinweis darauf, dass
  `Engine.rechne` und `Engine.co2Bilanz` bei einer Refaktorierung stärker verzahnt werden
  sollten, damit sie nicht divergieren können.

### 8.4 Ungenutzte/inkonsistent gepflegte Felder

- `Nutzer.zimmer`, `Nutzer.miete_monat`: werden beim Anlegen gesetzt, aber in
  `Engine.rechne()` an keiner Stelle gelesen (kein Umlageschlüssel „nach Zimmerzahl" oder
  „nach Kaltmiete" implementiert).
- `Nutzer._abrStatus`: wird nur von `App.alleFreigeben()` gesetzt, aber sonst nirgends
  ausgewertet oder angezeigt — vermutlich ein Rest einer früheren Idee für Freigabe pro
  einzelnem Mieter statt pro Abrechnungsjahr.
- `Block.hk` (z. B. ein Heizkreis-Kürzel im Block-Seed): im aktiven Code nicht referenziert (Block-ID
  selbst wird als Schlüssel verwendet, nicht `hk`).
- `Objekt.standardKostenartenStatus` existiert sowohl root- als auch abrechnungsbezogen je
  nach Migrationsstand einer Datei — welches Feld tatsächlich gelesen wird, hängt vom
  Aufrufkontext ab (`ensureStandardKostenarten` erhält immer die aktive `Abrechnung` als `o`).
  Bei sehr alten, nie neu geöffneten Datenständen könnte das Root-Feld „verwaist" sein.

### 8.5 UI-Interaktions-Komplexität ohne dokumentierten Vertrag

Der Buchungen-Tab (Abschnitt „Buchungen-Tab", Z. 4605–5310) enthält Drag-Fill-artige
Interaktionen (`_buchFillSetup`, `_buchFillDown`, `_buchFillUndo`, Z. 5089–5165) mit direkter
DOM-Manipulation (`document.querySelectorAll('td.fill-target')`) außerhalb des sonst üblichen
Renderzyklus. Diese Interaktion (Kostenart „nach unten ziehen" wie in Excel) ist nicht
fachlich, sondern rein UX-technisch, wurde aber nicht im Detail nachvollzogen (siehe
Abschnitt 9) — sie beeinflusst am Ende nur `_buchSetKostenart`/`syncBuchungen`, ist also
fachlich unkritisch, aber technisch aufwändig nachzubauen.

### 8.6 Geldbeträge als Fließkommazahlen (Abweichung von Masterplan 2.5/5.3)

Wie in Abschnitt 6 dargestellt, arbeitet die komplette App durchgängig mit
JavaScript-Fließkommazahlen in Euro, nicht mit Cent-Integern. Für die Migration ist das keine
Überraschung (im Masterplan bereits als Zielabweichung benannt), aber der Umfang der
betroffenen Felder ist groß (praktisch jedes `betrag`-Feld in jeder Entität). Die
Cent-Umstellung sollte früh im Schema-Package (PR 03) mit klaren Konvertierungsregeln beim
Legacy-Import definiert werden, da Rundungsdifferenzen sonst erst spät (bei
Characterization-Tests, PR 05) auffallen.

### 8.7 Betriebsstrom-Reallokation als „unsichtbare" Nebenwirkung

Die Betriebsstrom-Logik (Abschnitt 5, Schritt 4; `betriebsstromStatus()`, Z. 2376) verschiebt
Kosten aus einer per Checkbox markierten Stromposition in den Heiztopf, **begrenzt auf das
tatsächlich in dieser Position vorhandene Budget** (`bsFactor`). Das bedeutet: Ändert sich der
Betrag der markierten Stromposition, ändert sich implizit auch der Heizkosten-Betriebsstrom-
Anteil alle Blöcke, ohne dass dies an der Kostenart selbst sichtbar wird (nur über die
Heizkreise-Tab-Statusanzeige). Dies ist fachlich gewollt (Netto-Null-Umbuchung), aber ein
nicht-offensichtlicher Kopplungspunkt zwischen zwei sonst getrennten Tabs, der bei einer
Entkopplung in `packages/core` explizit als Vertrag (Eingabe: alle Kostenarten + alle
Heizkreis-Vorgaben; Ausgabe: Betriebsstrom je Block) dokumentiert werden sollte.

### 8.8 CSV-Import/-Export ist nur partiell abgesichert

`csvGuardCell()` (Z. 632) schützt ausschließlich Zellen des Beleglisten-Exports und nur,
wenn das erste Zeichen `=`, `+`, `-`, `@`, TAB oder CR ist. Führende Leerzeichen, weitere
Steuerzeichen und LF werden nicht normalisiert. Das ist ein partieller
Spreadsheet-Formelpräfix-Guard, **kein allgemeiner CSV-Sicherheitsnachweis**.

`buchParseCSV()` (Z. 4662) ist ein einfacher Eigenparser. Der Import besitzt kein explizites
Datei-, Zeilen- oder Feldlängenlimit und keine strikte Schema-/Datumsvalidierung. Importierte
Bank-/Buchungsdaten sind daher als nicht vertrauenswürdige, potenziell personenbezogene
Local-only-Daten zu behandeln: nicht loggen, nicht in Fixtures übernehmen und niemals nach
GitHub übertragen. Für die Migration sind ein etablierter Parser, Größenlimits,
Schema-Validierung sowie Tests für Escaping, Steuerzeichen und Spreadsheet-Injection
erforderlich.

---

## 9. Nicht behandelte/unsichere Bereiche

Die folgenden Bereiche wurden gesichtet, aber **nicht bis ins letzte Detail nachvollzogen** —
hier besteht Unsicherheit, die vor einer Migration dieser Teile gezielt nachgeprüft werden
sollte (nicht geraten):

1. **Drag-Fill-Mechanik im Buchungen-Tab** (`_buchFillSetup`/`_buchFillDown`/`_buchFillUndo`,
   Z. 5089–5165) — die genaue Interaktionslogik (welche Zellen als Ziel erkannt werden, wie
   Undo funktioniert) wurde nur überflogen, nicht Zeile für Zeile nachvollzogen.
2. **Stromzähler-Zuordnungs-Modals** (`App.stromzaehlerZuordnung` Z. 4041,
   `App.heizkreisZaehler` Z. 4167, `App.autoZuordneRechnungenNachVertragsnummer` Z. 4093,
   `App.autoZuordneLieferungenNachVertragsnummer` Z. 4215) — die Modal-Bau-Logik selbst wurde
   nicht im Detail gelesen; die referenzierten Kern-Datenfunktionen (`stromzaehlerLieferungen`,
   `stromzaehlerZugeordneteSumme`, `stromzaehlerVergleichswert`) wurden gelesen und sind in
   Abschnitt 4.4/3.11 dokumentiert.
3. **`App.nutzerDetail()`** (referenziert Z. 3330, Implementierung ab Z. 3632) — Detail-/
   Versandadress-Dialog eines einzelnen Nutzers wurde nicht gelesen; vermutlich reine
   Formularfelder auf bereits dokumentierten `Nutzer`-Feldern (`versand_strasse` etc.).
4. **Exportfunktion `exportBelegliste()`** (Z. 3820) — Spaltenaufbau, Zahlenformat und
   partieller Formelpräfix-Guard wurden nachvollzogen; nicht verifiziert ist die exakte
   Kompatibilität mit allen später verwendeten Tabellenprogrammen und Importprofilen.
5. **`buchUebernehmen`/`buchHauswartVertragAufteilen`/`_buchApplyVorschlag`/
   `_buchVorschlag`** (Z. 4843–5203) — die feineren Regeln, wie ein Buchungsvorschlag
   („gleicher Auftraggeber wie zuvor") zustande kommt und wie die Hauswart-Automatik im Detail
   mit bereits gesplitteten Buchungen umgeht, wurden nicht bis ins letzte Detail geprüft.
6. **Genaue Interaktion zwischen `App.erg` (zwischengespeichertes Berechnungsergebnis) und
   `Store.markDirty()`** (welches `App.erg=null` setzt, Z. 1106): Es gibt mehrere Stellen im
   Code, die `App.erg` nach `markDirty()` bewusst wiederherstellen (z. B. `pdfFreigabeOk`,
   Z. 4093), um einen Neuberechnungs-„Reset" zu vermeiden. Ob dies überall konsistent
   gehandhabt wird (kein PDF mit veralteten Zwischenwerten möglich), wurde nicht vollständig
   verifiziert.
7. **`o.excel_quelle`**-Herkunft: Das Feld wird gelesen (`vorausfuellenGesamt`, `oTabNutzer`-
   Hinweisbox), aber es gibt in dieser Datei **keine Funktion, die es erzeugt** — es muss aus
   einem externen, nicht in `index.html` enthaltenen Excel-Import-Werkzeug stammen (evtl.
   ein separates, hier nicht vorliegendes Skript). Die genaue Herkunft und das Format sind
   ungeklärt.
8. **`o.gesamt.we`**: Feld wird in `Engine.bezug()` als möglicher Bezugswert für
   `we_anzahl`-Umlage gelesen (`dwe`), aber in der UI (`oTabStamm`) nicht editierbar angeboten
   (nur `gesamt.flaeche`/`gesamt.einheiten` haben UI-Felder) — unklar, ob/wie dieser Wert in
   der Praxis jemals gesetzt wird außer über direkten JSON-Edit.
9. **Rechtliche Aktualität der in `rechtsPruefung()`/`BETRKV_KAT`/`co2MieterAnteil()`
   referenzierten Paragraphen und Urteile** (u. a. ein referenziertes Urteil „AG Pankow,
   04.03.2026 – 2 C 434/25", Z. 1911/3758) — die fachliche/juristische Richtigkeit wurde
   **nicht bewertet**, nur wie sie im Code technisch wirkt (welche Warnung/Umbenennung sie
   auslöst). Das Datum des Urteils liegt nach dem Stand dieses Dokuments unmittelbar in der
   Zukunft/Gegenwart des Projekts — dies ist wörtlich aus dem Code übernommen und nicht auf
   Plausibilität geprüft.

Kein Bereich wurde bewusst verschwiegen; alle oben genannten Punkte sind Bereiche, in denen
diese Bestandsaufnahme das gesehene Verhalten korrekt wiedergibt, aber keine vollständige
Zeile-für-Zeile-Verifikation stattgefunden hat.

---

## 10. Coverage-Anhang: ergänzend erfasste Definitionen

Der Definitionsscan erkennt 325 globale Funktionen sowie Methoden von `Store`, `Engine` und
`App`. 190 davon werden vor diesem Abschnitt bereits namentlich behandelt. Die folgende
Prüfliste enthält 113 migrationsrelevante Definitionen; sieben davon werden bewusst erneut
aufgeführt, weil der Coverage-Abgleich ihnen hier Gruppe, Ziel-Package und Prüftiefe zuordnet.
Sie ergänzt damit 106 zuvor noch nicht namentlich erfasste Definitionen. Reine
DOM-, Label- und Format-Helfer ohne Daten-, Sicherheits- oder Fachwirkung sind von diesem
migrationsbezogenen Nachweis ausgenommen. Mit Detailabschnitten plus Anhang gilt für die
festgelegte Abgrenzung: 190 + 106 migrationsrelevante Definitionen + 29 explizite
Präsentationshelfer = 325, **unmapped = 0**.

| Zeile | Definition | Funktionsgruppe | Ziel-Package | Prüftiefe |
|---:|---|---|---|---|
| 284 | `heizquellenVonHk` | heating-source-resolution | `packages/core/heating` | tief |
| 328 | `heizUebersichtHtml` | heating-result-view | `apps/web` | gruppiert |
| 395 | `heizVerteilungKurzHtml` | heating-result-view | `apps/web` | gruppiert |
| 434 | `autoHeizkreisKostenHtml` | heating-result-view | `apps/web` | gruppiert |
| 507 | `_aktiveBloecke` | building-block-scope | `packages/core/heating` | gruppiert |
| 519 | `getBlock` | building-block-scope | `packages/core/heating` | gruppiert |
| 523 | `neueBlockId` | building-block-schema | `packages/schema` | gruppiert |
| 525 | `ensureObjektBloecke` | building-block-migration | `packages/schema` | tief |
| 526 | `normScopeKey` | allocation-scope | `packages/schema` | gruppiert |
| 527 | `scopeIstBlock` | allocation-scope | `packages/core/allocation` | gruppiert |
| 541 | `hausScopes` | allocation-scope | `packages/core/allocation` | gruppiert |
| 577 | `formatSchlPdf` | pdf-allocation-format | `packages/pdf` | gruppiert |
| 620 | `parseDE` | input-number-parsing | `packages/schema` | gruppiert |
| 632 | `csvGuardCell` | partial-spreadsheet-formula-prefix-guard | `packages/import-export` | tief |
| 681 | `tageImJahr` | period-calculation | `packages/core/periods` | gruppiert |
| 905 | `idb` | indexeddb-access | `packages/persistence` | gruppiert |
| 907 | `idbGet` | indexeddb-access | `packages/persistence` | gruppiert |
| 908 | `idbSnapAdd` | snapshot-storage | `packages/persistence` | gruppiert |
| 909 | `idbSnapGet` | snapshot-storage | `packages/persistence` | gruppiert |
| 910 | `idbSnapKeys` | snapshot-storage | `packages/persistence` | gruppiert |
| 911 | `idbSnapDelete` | snapshot-storage | `packages/persistence` | gruppiert |
| 1061 | `konfliktUeberschreiben` | persistence-conflict-resolution | `packages/persistence` | tief |
| 1095 | `reaktivieren` | persistence-reactivation | `packages/persistence` | gruppiert |
| 1113 | `scheduleAutosave` | autosave-scheduling | `packages/persistence` | gruppiert |
| 1122 | `autosaveNow` | autosave-execution | `packages/persistence` | tief |
| 1183 | `zeigeSnapshotVerlauf` | snapshot-ui | `apps/web` | gruppiert |
| 1193 | `snapshotWiederherstellen` | snapshot-restore | `packages/persistence` | tief |
| 1204 | `flush` | persistence-flush | `packages/persistence` | tief |
| 1205 | `setStatus` | persistence-state | `packages/persistence` | gruppiert |
| 1225 | `setupAuto` | file-persistence-setup | `packages/persistence` | tief |
| 1242 | `ensurePerm` | file-permission | `packages/persistence` | tief |
| 1248 | `speichern` | file-save | `packages/persistence` | gruppiert |
| 1256 | `loadFromFile` | file-load | `packages/persistence` | tief |
| 1408 | `buchungslinkFehltAnzahl` | booking-validation | `packages/validators` | gruppiert |
| 1411 | `heizkreisBuchungslinkFehltAnzahl` | heating-booking-validation | `packages/validators` | gruppiert |
| 1416 | `kostenartInAbrechnungSichtbar` | cost-visibility | `packages/core/allocation` | gruppiert |
| 1492 | `stromzaehlerRelevantFuerZeitraum` | meter-period-validation | `packages/validators` | tief |
| 1565 | `heizkreisZaehlerStatus` | heating-meter-status | `packages/validators` | tief |
| 2039 | `activeAbrechnung` | accounting-selection | `packages/core/allocation` | gruppiert |
| 2043 | `buchungAbrechnung` | booking-accounting-resolution | `packages/core/allocation` | tief |
| 2052 | `normText` | booking-normalization | `packages/import-export` | gruppiert |
| 2053 | `buchungText` | booking-normalization | `packages/import-export` | gruppiert |
| 2068 | `removeHkBuchungRefs` | booking-heating-reference-sync | `packages/import-export` | tief |
| 2087 | `buchungLieferung` | delivery-booking-resolution | `packages/core/heating` | tief |
| 2102 | `ensureHkQuelle` | heating-source-migration | `packages/core/heating` | tief |
| 2123 | `syncHkDelivery` | booking-delivery-sync | `packages/import-export` | tief |
| 2148 | `hkLieferungTagVonBuchung` | delivery-date-resolution | `packages/core/heating` | tief |
| 2164 | `hkLieferungManuelleMengeVonBuchung` | delivery-quantity-resolution | `packages/core/heating` | tief |
| 2249 | `buchungNkLinkTargets` | booking-link-targets | `packages/core/allocation` | tief |
| 2258 | `buchungTargetIstVerknuepft` | booking-link-status | `packages/validators` | gruppiert |
| 2270 | `buchungNkLinkStatus` | booking-link-status | `packages/validators` | tief |
| 2278 | `buchungIstHardNkUebernommen` | booking-transfer-status | `packages/validators` | gruppiert |
| 2302 | `ensureKostenartByKey` | cost-category-resolution | `packages/core/allocation` | tief |
| 2326 | `hauswartVertragSummary` | caretaker-contract-allocation | `packages/core/allocation` | tief |
| 2338 | `hauswartVertragHinweisHtml` | caretaker-contract-warning | `apps/web` | gruppiert |
| 2762 | `dialogAuto` | persistence-dialog | `apps/web` | gruppiert |
| 2850 | `setAnschreibenAktiv` | output-configuration | `apps/web` | gruppiert |
| 2866 | `setStromzaehlerJahrFeld` | meter-year-state | `apps/web` | gruppiert |
| 3373 | `addGrundsteuerHaus` | property-tax-allocation | `packages/core/allocation` | tief |
| 3383 | `oTabGrundsteuer` | property-tax-ui | `apps/web` | gruppiert |
| 3615 | `loadDemo` | dataset-replacement | `packages/import-export` | tief |
| 3860 | `setK` | cost-record-update | `apps/web` | gruppiert |
| 3861 | `setBelegUmlage` | receipt-allocation | `packages/core/allocation` | tief |
| 3864 | `_externGrundPrompt` | external-payment-reason | `apps/web` | gruppiert |
| 3870 | `setBelegExternOk` | external-payment-validation | `packages/validators` | tief |
| 3875 | `resetBelegExternOk` | external-payment-validation | `packages/validators` | gruppiert |
| 3879 | `liefExternToggle` | external-delivery-validation | `packages/validators` | tief |
| 3898 | `belegDateiUpload` | receipt-attachment | `packages/import-export` | tief |
| 3910 | `belegDateiEntfernen` | receipt-attachment | `packages/import-export` | gruppiert |
| 3916 | `belegDateiOeffnen` | receipt-attachment | `packages/import-export` | gruppiert |
| 3925 | `delK` | cost-record-delete | `apps/web` | gruppiert |
| 3931 | `deaktiviereStandard` | cost-category-state | `packages/core/allocation` | tief |
| 3941 | `aktiviereStandard` | cost-category-state | `packages/core/allocation` | tief |
| 4084 | `setRechnungZaehler` | invoice-meter-link | `packages/core/heating` | tief |
| 4114 | `setStromzaehlerSchaetzung` | meter-estimate | `packages/core/heating` | gruppiert |
| 4127 | `uebernehmeSchaetzungInAbrechnung` | meter-estimate-transfer | `packages/core/heating` | tief |
| 4143 | `uebernehmeSchaetzungHeizkreis` | heating-estimate-transfer | `packages/core/heating` | tief |
| 4234 | `setLieferungZaehler` | delivery-meter-link | `packages/core/heating` | tief |
| 4272 | `hkById` | heating-circuit-resolution | `packages/core/heating` | gruppiert |
| 4281 | `delBlk` | heating-block-delete | `packages/core/heating` | tief |
| 4290 | `setLiefBlk` | block-delivery-update | `packages/core/heating` | gruppiert |
| 4291 | `addLiefBlk` | block-delivery-create | `packages/core/heating` | gruppiert |
| 4292 | `delLiefBlk` | block-delivery-delete | `packages/core/heating` | gruppiert |
| 4293 | `setQuelleBlk` | block-source-update | `packages/core/heating` | gruppiert |
| 4294 | `setQuelleLiefBlk` | block-source-delivery-update | `packages/core/heating` | gruppiert |
| 4295 | `addQuelleLiefBlk` | block-source-delivery-create | `packages/core/heating` | gruppiert |
| 4296 | `delQuelleLiefBlk` | block-source-delivery-delete | `packages/core/heating` | gruppiert |
| 4516 | `oTabFreigabe` | release-validation-ui | `apps/web` | gruppiert |
| 4662 | `buchParseCSV` | booking-csv-parsing | `packages/import-export` | tief |
| 4783 | `buchEdit` | booking-edit | `apps/web` | gruppiert |
| 4883 | `_buchSet` | booking-field-update | `apps/web` | gruppiert |
| 4884 | `_buchSetUmlage` | booking-allocation-update | `packages/core/allocation` | tief |
| 4885 | `_buchSplitSetUmlage` | booking-split-allocation | `packages/core/allocation` | tief |
| 4892 | `_kostenartInJahr` | cost-category-period-check | `packages/core/allocation` | gruppiert |
| 4897 | `_buchSetAbrJahr` | booking-accounting-year | `packages/core/allocation` | tief |
| 4930 | `_buchSplitDel` | booking-split-delete | `packages/core/allocation` | gruppiert |
| 4932 | `_buchSplitSet` | booking-split-update | `packages/core/allocation` | tief |
| 4934 | `_buchSplitSetHauswartProz` | caretaker-booking-split | `packages/core/allocation` | tief |
| 4944 | `buchDel` | booking-delete | `apps/web` | gruppiert |
| 4949 | `buchDelConfirm` | booking-delete-confirmation | `apps/web` | gruppiert |
| 4972 | `buchToggleGeprueft` | booking-review-status | `apps/web` | gruppiert |
| 4995 | `buchHkEintragen` | booking-heating-transfer | `packages/core/heating` | tief |
| 5026 | `buchHkQuick` | booking-heating-quick-transfer | `packages/core/heating` | tief |
| 5038 | `buchNeu` | booking-create | `apps/web` | gruppiert |
| 5074 | `renderBuchungen` | booking-ui | `apps/web` | gruppiert |
| 5311 | `oTabBuchungen` | booking-ui | `apps/web` | gruppiert |
| 5528 | `oTabAbrechnung` | accounting-ui | `apps/web` | gruppiert |
| 5595 | `ensureErg` | calculation-result-cache | `packages/core/allocation` | tief |
| 5596 | `berechne` | calculation-orchestration | `packages/core/allocation` | tief |
| 5648 | `co2NachweisHtml` | co2-output | `packages/pdf` | gruppiert |
| 5676 | `pdfTechemBereiche` | techem-section-selection | `packages/pdf` | tief |
| 5684 | `pdfTechemKennzahlen` | techem-metrics | `packages/pdf` | tief |
| 5769 | `pdfTechemKostenaufstellungEinzel` | techem-cost-output | `packages/pdf` | gruppiert |

### 10.1 Explizit ausgeschlossene Präsentationshelfer

Diese 29 Definitionen wurden vom migrationsrelevanten Tiefen-Coverage-Scope ausgeschlossen,
sind aber zur vollständigen Nachvollziehbarkeit des Definitionsscans ausdrücklich erfasst.
Sie erzeugen oder aktualisieren ausschließlich DOM-, Label-, Badge-, Options- oder
Inline-HTML-Darstellung und enthalten nach Sichtung keine eigenständige persistente
Fachentscheidung. Ihr Ziel ist bei Bedarf eine Neuimplementierung in `apps/web`, nicht eine
Übernahme in Core-Pakete.

| Zeile | Definition | Ausschlussgrund |
|---:|---|---|
| 250 | `_pruneFeldHandlers` | DOM-Handler-Bereinigung |
| 535 | `hausLabel` | Label-Formatierung |
| 563 | `scopeLabel` | Label-Formatierung |
| 569 | `scopeLabelLang` | Label-Formatierung |
| 608 | `betrKVAnzeige` | Anzeigeformatierung |
| 638 | `jsArg` | UI-Argument-Escaping; Sicherheitsanforderung bleibt separat erhalten |
| 719 | `auszugText` | Anzeigeformatierung |
| 1043 | `showBanner` | DOM-Banner |
| 1049 | `hideBanner` | DOM-Banner |
| 1084 | `_zeigeMehrereTabsWarnung` | DOM-Warnung |
| 1088 | `showVersionsBanner` | DOM-Banner |
| 1571 | `heizkreisZaehlerBadgeHtml` | Badge-HTML |
| 1614 | `stromzaehlerSektionHtml` | Abschnitts-HTML |
| 2784 | `crumbs` | Navigationstext |
| 2795 | `note` | DOM-Hinweis |
| 3148 | `_tabBadges` | Badge-HTML |
| 4607 | `buchKatBadge` | Badge-HTML |
| 4733 | `_buchKaOpts` | Select-Optionen |
| 4750 | `_buchKaOptsYear` | Select-Optionen |
| 4887 | `_buchAbrJahrOpts` | Select-Optionen |
| 4974 | `_buchHkOpts` | Select-Optionen |
| 5077 | `_buchSearchInput` | DOM-Fokuspflege |
| 5166 | `_buchFlash` | DOM-Kurzhinweis |
| 5174 | `_buchKaName` | Anzeigeformatierung |
| 5204 | `_buchInlineHTML` | Inline-Editor-HTML |
| 5270 | `buchInlineToggle` | Inline-Editor-DOM |
| 5286 | `_buchInlineRefresh` | Inline-Editor-DOM |
| 5291 | `_buchInlineBadge` | Inline-Badge-HTML |
| 5301 | `buchInlineClose` | Inline-Editor-DOM |
