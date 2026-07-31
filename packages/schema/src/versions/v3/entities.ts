/**
 * Legacy-Schema Version 3 — Entitäten, wie sie tatsächlich im Code der
 * Alt-App verwendet werden (Quelle: legacy/behavior-map.md Abschnitt 3,
 * verifiziert gegen legacy/index.html).
 *
 * Alle Objekte sind `loose`: unbekannte Felder bleiben erhalten.
 * Feldnamen sind die Legacy-Originalnamen (deutsch, snake_case).
 */
import { z } from 'zod'
import {
  v3BooleanishSchema,
  v3DateishSchema,
  v3IdSchema,
  v3NumberishSchema,
  v3StringishSchema,
} from './common'

/** Beleg/Rechnung einer Kostenart (behavior-map 3.6). */
export const v3BelegSchema = z.looseObject({
  datum: v3DateishSchema.optional(),
  bezeichnung: v3StringishSchema.optional(),
  betrag: v3NumberishSchema.optional(),
  beleg: v3StringishSchema.optional(),
  datei_data: v3StringishSchema.optional(),
  datei_name: v3StringishSchema.optional(),
  datei_typ: v3StringishSchema.optional(),
  umlage_proz: v3NumberishSchema.optional(),
  _buchung: v3StringishSchema.optional(),
  _buchung_split: v3StringishSchema.optional(),
  _extern_ok: v3BooleanishSchema.optional(),
  _extern_grund: v3StringishSchema.optional(),
  _stromzaehler_id: v3StringishSchema.optional(),
  _geschaetzt: v3BooleanishSchema.optional(),
  _schaetzung_grund: v3StringishSchema.optional(),
})
export type V3Beleg = z.infer<typeof v3BelegSchema>

/** Kostenart/Kostenposition (behavior-map 3.5). */
export const v3KostenartSchema = z.looseObject({
  id: v3IdSchema,
  standard_key: v3StringishSchema.optional(),
  typ: v3StringishSchema.optional(),
  bezeichnung: v3StringishSchema.optional(),
  kostentext: v3StringishSchema.optional(),
  betrKV_kat: v3StringishSchema.optional(),
  umlage_nach: v3StringishSchema.optional(),
  betrag: v3NumberishSchema.optional(),
  datum: v3DateishSchema.optional(),
  scope_key: v3StringishSchema.optional(),
  rechnungen: z.array(v3BelegSchema).optional(),
  betriebsstrom_abzug: v3BooleanishSchema.optional(),
  abrechnung_ausblenden: v3BooleanishSchema.optional(),
  umlage_proz: v3NumberishSchema.optional(),
  lohn_anteil_proz: v3NumberishSchema.optional(),
  aus_grundsteuer_import: v3BooleanishSchema.optional(),
  grundsteuermessbetrag_eur: v3NumberishSchema.optional(),
})
export type V3Kostenart = z.infer<typeof v3KostenartSchema>

/** Nutzer/Nutzungseinheit (behavior-map 3.4). */
export const v3NutzerSchema = z.looseObject({
  id: v3IdSchema,
  nr: v3NumberishSchema.optional(),
  aktiv: v3StringishSchema.optional(),
  leerstand: v3BooleanishSchema.optional(),
  name: v3StringishSchema.optional(),
  vorname: v3StringishSchema.optional(),
  nachname: v3StringishSchema.optional(),
  anrede: v3StringishSchema.optional(),
  nutzeinheit: v3StringishSchema.optional(),
  lage: v3StringishSchema.optional(),
  mandatsref: v3StringishSchema.optional(),
  firma_privat: v3StringishSchema.optional(),
  email: v3StringishSchema.optional(),
  eingezogen: v3DateishSchema.optional(),
  ausgezogen: v3DateishSchema.optional(),
  flaeche_nf: v3NumberishSchema.optional(),
  flaeche_nf_hzg: v3NumberishSchema.optional(),
  personen: v3NumberishSchema.optional(),
  zimmer: v3NumberishSchema.optional(),
  einheiten: v3NumberishSchema.optional(),
  einheiten_geschaetzt: v3BooleanishSchema.optional(),
  einheiten_schatz_grund: v3StringishSchema.optional(),
  kuerzung12_anwenden: v3BooleanishSchema.optional(),
  kosten_scope: v3StringishSchema.optional(),
  grundsteuer_key: v3StringishSchema.optional(),
  vz_monat: v3NumberishSchema.optional(),
  vz_gesamt: v3NumberishSchema.optional(),
  keine_vz_vereinbart: v3BooleanishSchema.optional(),
  miete_monat: v3NumberishSchema.optional(),
  versand_strasse: v3StringishSchema.optional(),
  versand_plz_ort: v3StringishSchema.optional(),
  versanddatum_nutzer: v3DateishSchema.optional(),
  bemerkung: v3StringishSchema.optional(),
  kaltwasser_m3: v3NumberishSchema.optional(),
  wasser_m3: v3NumberishSchema.optional(),
  _abrStatus: v3StringishSchema.optional(),
})
export type V3Nutzer = z.infer<typeof v3NutzerSchema>

/** Brennstofflieferung (behavior-map 3.10). */
export const v3LieferungSchema = z.looseObject({
  datum: v3DateishSchema.optional(),
  menge: v3NumberishSchema.optional(),
  mengeneinheit: v3StringishSchema.optional(),
  mengenstatus: v3StringishSchema.optional(),
  mengenhinweis: v3StringishSchema.optional(),
  betrag: v3NumberishSchema.optional(),
  bezeichnung: v3StringishSchema.optional(),
  beleg: v3StringishSchema.optional(),
  _buchung: v3StringishSchema.optional(),
  _buchung_split: v3StringishSchema.optional(),
  _menge_manuell: v3BooleanishSchema.optional(),
  _extern_ok: v3BooleanishSchema.optional(),
  _extern_grund: v3StringishSchema.optional(),
  _stromzaehler_id: v3StringishSchema.optional(),
  _konvertiert_von_kostenart: v3StringishSchema.optional(),
})
export type V3Lieferung = z.infer<typeof v3LieferungSchema>

/** Brennstoff-Block einer Energiequelle (behavior-map 3.8/3.9). */
export const v3BrennstoffSchema = z.looseObject({
  art: v3StringishSchema.optional(),
  heizwert_kwh: v3NumberishSchema.optional(),
  anfangsbestand_menge: v3NumberishSchema.optional(),
  anfangsbestand_wert: v3NumberishSchema.optional(),
  anfangsbestand_preis: v3NumberishSchema.optional(),
  restbestand_menge: v3NumberishSchema.optional(),
  lieferungen: z.array(v3LieferungSchema).optional(),
})
export type V3Brennstoff = z.infer<typeof v3BrennstoffSchema>

/** Energiequelle eines Heizkreises (behavior-map 3.9). */
export const v3EnergiequelleSchema = z.looseObject({
  id: v3IdSchema,
  name: v3StringishSchema.optional(),
  art: v3StringishSchema.optional(),
  heizwert_kwh: v3NumberishSchema.optional(),
  co2_faktor_kg_kwh: v3NumberishSchema.optional(),
  anfangsbestand_menge: v3NumberishSchema.optional(),
  anfangsbestand_wert: v3NumberishSchema.optional(),
  anfangsbestand_preis: v3NumberishSchema.optional(),
  restbestand_menge: v3NumberishSchema.optional(),
  lieferungen: z.array(v3LieferungSchema).optional(),
})
export type V3Energiequelle = z.infer<typeof v3EnergiequelleSchema>

/** CO₂-Parameter eines Heizkreises (behavior-map 3.8). */
export const v3Co2Schema = z.looseObject({
  modus: v3StringishSchema.optional(),
  co2_faktor_kg_kwh: v3NumberishSchema.optional(),
  co2_preis_eur_t: v3NumberishSchema.optional(),
  abgabe: v3NumberishSchema.optional(),
  aufteilung_vermieter_proz: v3NumberishSchema.optional(),
  kennwert_kg_m2a: v3NumberishSchema.optional(),
})
export type V3Co2 = z.infer<typeof v3Co2Schema>

/** Heizkreis-Vorgaben (behavior-map 3.8, objektweit oder je Heizkreis). */
export const v3VorgabenSchema = z.looseObject({
  verbrauch_proz: v3NumberishSchema.optional(),
  grund_proz: v3NumberishSchema.optional(),
  grundkosten_umlage: v3StringishSchema.optional(),
  solar_proz: v3NumberishSchema.optional(),
  betriebsstrom_proz: v3NumberishSchema.optional(),
  mwst_modus: v3StringishSchema.optional(),
  abweichung_begruendung: v3StringishSchema.optional(),
})
export type V3Vorgaben = z.infer<typeof v3VorgabenSchema>

/** Heizkreis eines Abrechnungsjahres (behavior-map 3.8). */
export const v3HeizkreisSchema = z.looseObject({
  id: v3IdSchema,
  brennstoff: v3BrennstoffSchema.optional(),
  energiequellen: z.array(v3EnergiequelleSchema).optional(),
  co2: v3Co2Schema.optional(),
  vorgaben: v3VorgabenSchema.optional(),
  hat_warmwasser: v3BooleanishSchema.optional(),
  ww_anteil_proz: v3NumberishSchema.optional(),
})
export type V3Heizkreis = z.infer<typeof v3HeizkreisSchema>

/** Heizkreis-Block-Definition, jahresunabhängig (behavior-map 3.7). */
export const v3BlockSchema = z.looseObject({
  id: v3IdSchema,
  name: v3StringishSchema.optional(),
  kuerzel: v3StringishSchema.optional(),
  energietraeger: v3StringishSchema.optional(),
  prefix: z.array(z.string()).optional(),
  hk: v3StringishSchema.optional(),
})
export type V3Block = z.infer<typeof v3BlockSchema>

/** Stromzähler-Stammdaten (behavior-map 3.11). */
export const v3StromzaehlerSchema = z.looseObject({
  id: v3IdSchema,
  adresse: v3StringishSchema.optional(),
  zaehlernummer: v3StringishSchema.optional(),
  malo_id: v3StringishSchema.optional(),
  art: v3StringishSchema.optional(),
  anbieter: v3StringishSchema.optional(),
  vertragsnummer_oder_konto: v3StringishSchema.optional(),
  heizkreis_id: v3StringishSchema.optional(),
  gueltig_von: v3DateishSchema.optional(),
  gueltig_bis: v3DateishSchema.optional(),
  zaehlernummer_status: v3StringishSchema.optional(),
  notiz: v3StringishSchema.optional(),
  zusatz_hinweis: v3StringishSchema.optional(),
  jahresstatus: z
    .record(
      z.string(),
      z.looseObject({
        buchung_vorhanden: v3BooleanishSchema.optional(),
        jahresrechnung_vorhanden: v3BooleanishSchema.optional(),
        notiz: v3StringishSchema.optional(),
        schaetzung_betrag: v3NumberishSchema.optional(),
        schaetzung_grund: v3StringishSchema.optional(),
      }),
    )
    .optional(),
})
export type V3Stromzaehler = z.infer<typeof v3StromzaehlerSchema>

/** Split einer Kontobuchung (behavior-map 3.12). */
export const v3BuchungSplitSchema = z.looseObject({
  id: v3IdSchema,
  betrag: v3NumberishSchema.optional(),
  kostenart_id: v3StringishSchema.optional(),
  abr_jahr: v3NumberishSchema.optional(),
  bemerkung: v3StringishSchema.optional(),
  umlage_proz: v3NumberishSchema.optional(),
  kategorie: v3StringishSchema.optional(),
  _hauswartvertrag: v3BooleanishSchema.optional(),
})
export type V3BuchungSplit = z.infer<typeof v3BuchungSplitSchema>

const v3HauswartvertragInfoSchema = z
  .strictObject({
    titel: v3StringishSchema.optional(),
    dienstleister: v3StringishSchema.optional(),
    auftraggeber: v3StringishSchema.optional(),
    objekt: v3StringishSchema.optional(),
    netto_monat: v3NumberishSchema.optional(),
    umlagefaehig_proz: v3NumberishSchema.optional(),
    nicht_umlagefaehig_proz: v3NumberishSchema.optional(),
    hinweis: v3StringishSchema.optional(),
    aufgeteilt_am: v3StringishSchema.optional(),
    regel: v3StringishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

/** Importierte Kontobuchung (behavior-map 3.12). */
export const v3BuchungSchema = z.looseObject({
  id: v3IdSchema,
  hash: v3StringishSchema.optional(),
  datum: v3DateishSchema.optional(),
  betrag: v3NumberishSchema.optional(),
  auftraggeber: v3StringishSchema.optional(),
  verwendungszweck: v3StringishSchema.optional(),
  buchungstext: v3StringishSchema.optional(),
  kategorie: v3StringishSchema.optional(),
  bemerkung: v3StringishSchema.optional(),
  kostenart_id: v3StringishSchema.optional(),
  abr_jahr: v3NumberishSchema.optional(),
  umlage_proz: v3NumberishSchema.optional(),
  splits: z.array(v3BuchungSplitSchema).optional(),
  _heizkreis: v3StringishSchema.optional(),
  _hk: v3StringishSchema.optional(),
  _geprueft: v3BooleanishSchema.optional(),
  _hauswartvertrag: z
    .union([v3BooleanishSchema, v3HauswartvertragInfoSchema])
    .optional(),
  _importiert: v3StringishSchema.optional(),
})
export type V3Buchung = z.infer<typeof v3BuchungSchema>

/** Freigabeprotokoll-Eintrag (behavior-map 3.13, append-only). */
export const v3ProtokollEintragSchema = z.looseObject({
  ts: z.union([z.number(), z.string(), z.null()]).optional(),
  aktion: v3StringishSchema.optional(),
  nutzerAnzahl: v3NumberishSchema.optional(),
  fehler: v3NumberishSchema.optional(),
  warnungen: v3NumberishSchema.optional(),
  version: v3StringishSchema.optional(),
})
export type V3ProtokollEintrag = z.infer<typeof v3ProtokollEintragSchema>

/** Abrechnungsjahr (behavior-map 3.3). */
export const v3AbrechnungSchema = z.looseObject({
  id: v3IdSchema,
  jahr: v3NumberishSchema.optional(),
  zeitraum: z
    .looseObject({
      von: v3DateishSchema.optional(),
      bis: v3DateishSchema.optional(),
    })
    .optional(),
  status: v3StringishSchema.optional(),
  versanddatum: v3DateishSchema.optional(),
  vorgaben: v3VorgabenSchema.optional(),
  gesamt: z
    .looseObject({
      flaeche: v3NumberishSchema.optional(),
      flaeche_hzg: v3NumberishSchema.optional(),
      personen: v3NumberishSchema.optional(),
      einheiten: v3NumberishSchema.optional(),
      we: v3NumberishSchema.optional(),
    })
    .optional(),
  nutzer: z.array(v3NutzerSchema).optional(),
  kostenarten: z.array(v3KostenartSchema).optional(),
  standardKostenartenStatus: z
    .record(
      z.string(),
      z.looseObject({
        aktiv: v3BooleanishSchema.optional(),
        grund: v3StringishSchema.optional(),
      }),
    )
    .optional(),
  heizkreise: z.array(v3HeizkreisSchema).optional(),
  /** Legacy-Einzelblock-Fallback, wenn `heizkreise` fehlt. */
  brennstoff: v3BrennstoffSchema.optional(),
  co2: v3Co2Schema.optional(),
  hinweise: z
    .looseObject({
      allgemein: v3StringishSchema.optional(),
      guthaben: v3StringishSchema.optional(),
      nachzahlung: v3StringishSchema.optional(),
    })
    .optional(),
  anschreiben: z
    .looseObject({
      aktiv: v3BooleanishSchema.optional(),
      text: v3StringishSchema.optional(),
    })
    .optional(),
  _protokoll: z.array(v3ProtokollEintragSchema).optional(),
  _ts: z.union([z.number(), z.string(), z.null()]).optional(),
})
export type V3Abrechnung = z.infer<typeof v3AbrechnungSchema>

/**
 * Objekt/Liegenschaft (behavior-map 3.2). Enthält zusätzlich die
 * historischen Root-Felder des Vor-`abrechnungen[]`-Layouts (`jahr`,
 * `zeitraum`, `nutzer`, …), die `migrateObjekt()` der Alt-App beim
 * ersten Öffnen nach `abrechnungen[0]` verschiebt — alte Exporte können
 * sie noch tragen und müssen importierbar bleiben.
 */
export const v3ObjektSchema = z.looseObject({
  id: v3IdSchema,
  eigene_nr: v3StringishSchema.optional(),
  objekt_nr: v3StringishSchema.optional(),
  strasse: v3StringishSchema.optional(),
  plz_ort: v3StringishSchema.optional(),
  iban: v3StringishSchema.optional(),
  kontoinhaber: v3StringishSchema.optional(),
  bloecke: z.array(v3BlockSchema).optional(),
  stromzaehler: z.array(v3StromzaehlerSchema).optional(),
  buchungen: z.array(v3BuchungSchema).optional(),
  abrechnungen: z.array(v3AbrechnungSchema).optional(),
  standardKostenartenStatus: z.record(z.string(), z.unknown()).optional(),
  excel_quelle: z.record(z.string(), z.unknown()).optional(),
  _betrKVNumFix: v3BooleanishSchema.optional(),
  _betrKVNumFixInfo: v3NumberishSchema.optional(),
  // Historisches Root-Layout (vor Einführung von `abrechnungen[]`):
  jahr: v3NumberishSchema.optional(),
  zeitraum: z.record(z.string(), z.unknown()).optional(),
  vorgaben: v3VorgabenSchema.optional(),
  gesamt: z.record(z.string(), z.unknown()).optional(),
  nutzer: z.array(v3NutzerSchema).optional(),
  kostenarten: z.array(v3KostenartSchema).optional(),
  heizkreise: z.array(v3HeizkreisSchema).optional(),
  brennstoff: v3BrennstoffSchema.optional(),
  co2: v3Co2Schema.optional(),
  hinweise: z.record(z.string(), z.unknown()).optional(),
})
export type V3Objekt = z.infer<typeof v3ObjektSchema>

/** Firma/Eigentümer (behavior-map 3.1). */
export const v3FirmaSchema = z.looseObject({
  id: v3IdSchema,
  name1: v3StringishSchema.optional(),
  name2: v3StringishSchema.optional(),
  name3: v3StringishSchema.optional(),
  name4: v3StringishSchema.optional(),
  strasse: v3StringishSchema.optional(),
  plz_ort: v3StringishSchema.optional(),
  postfach: v3StringishSchema.optional(),
  ansprechpartner: z
    .looseObject({
      anrede: v3StringishSchema.optional(),
      vorname: v3StringishSchema.optional(),
      name: v3StringishSchema.optional(),
      telefon: v3StringishSchema.optional(),
      mobil: v3StringishSchema.optional(),
      fax: v3StringishSchema.optional(),
      email: v3StringishSchema.optional(),
    })
    .optional(),
  bank: z
    .looseObject({
      iban: v3StringishSchema.optional(),
      bic: v3StringishSchema.optional(),
      kontoinhaber: v3StringishSchema.optional(),
      kreditinstitut: v3StringishSchema.optional(),
    })
    .optional(),
  objekte: z.array(v3ObjektSchema).optional(),
})
export type V3Firma = z.infer<typeof v3FirmaSchema>
