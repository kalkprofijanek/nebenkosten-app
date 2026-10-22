/**
 * Öffentliche Typen der monatlichen Verbrauchsinformation (§ 6a Abs. 2
 * HeizKV, ADR-0014 Schritt 2). Alle Mengen in der Ausgabe sind gerundet:
 * kWh auf ganze kWh, m³ auf 0,01 m³; gerechnet wird ungerundet.
 */

/** Grund, warum ein Monatswert nicht ermittelt werden kann. */
export type MonthlyValueUnavailableReason =
  /** Ein Monatsendstand (Monat oder Vormonat) fehlt im Toleranzfenster. */
  | 'reading_missing'
  /** Endstand kleiner als Anfangsstand; wird nicht glattgerechnet. */
  | 'negative_consumption'
  /** Mehrere unterschiedliche Stände am selben maßgeblichen Tag. */
  | 'reading_conflict'
  /** Der Einheit ist im Abrechnungszeitraum kein Zähler zugeordnet. */
  | 'meter_not_assigned'
  /** Der Mieter hat die Einheit im Vergleichsmonat nicht genutzt. */
  | 'no_usage'
  /**
   * Nutzung im Vergleichsmonat nicht feststellbar (kein Abrechnungszeitraum
   * und kein Einzugsdatum am Mietverhältnis).
   */
  | 'usage_unknown'

/**
 * Monatswert einer Nutzung (aktueller Monat oder Vergleichsmonat).
 * `not_collected` entspricht „soweit erhoben“ (§ 6a Abs. 2 Nr. 2 HeizKV).
 */
export type MonthlyValue =
  | {
      status: 'collected'
      /** Gerundet (kWh ganzzahlig, m³ auf 0,01). */
      value: number
      /** Nutzungszeitraum innerhalb des Monats, auf den sich der Wert bezieht. */
      from: string
      to: string
    }
  | {
      status: 'not_collected'
      value: null
      reason: MonthlyValueUnavailableReason
    }

/** Ablesung, die als Monatsendstand verwendet wurde. */
export interface MonthlyReadingRef {
  readingId: string
  date: string
  value: number
}

/** Herleitung des aktuellen Monatsverbrauchs je Zähler (Nachvollziehbarkeit). */
export interface MonthlyMeterTrace {
  meterId: string
  meterNumber: string | null
  /** Endstand des Vormonats. */
  startReading: MonthlyReadingRef | null
  /** Endstand des Monats. */
  endReading: MonthlyReadingRef | null
}

export interface MonthlyHeatingInformation {
  unit: 'kWh'
  current: MonthlyValue
  previousMonth: MonthlyValue
  previousYearMonth: MonthlyValue
  meters: MonthlyMeterTrace[]
}

/** Warmwasser eines Zeitraums als Volumen und Energie (§ 9 Abs. 2 HeizKV). */
export interface MonthlyHotWaterValue {
  m3: MonthlyValue
  kwh: MonthlyValue
}

export interface MonthlyHotWaterInformation {
  heatingCircuitId: string
  /** Mittlere Warmwassertemperatur tw in °C für 2,5 × V × (tw − 10). */
  temperatureC: number
  /** tw geschätzt oder Standardannahme (offene Annahme, siehe `assumptions`). */
  temperatureEstimated: boolean
  current: MonthlyHotWaterValue
  previousMonth: MonthlyHotWaterValue
  previousYearMonth: MonthlyHotWaterValue
  meters: MonthlyMeterTrace[]
}

export type MonthlyAverageUserUnavailableReason =
  /** Für den Heizkreis sind keine Vergleichswerte erfasst. */
  | 'no_benchmark'
  /** Weder beheizte Fläche noch Nutzfläche der Einheit erfasst. */
  | 'area_unknown'
  /** Vergleichswerte enthalten Warmwasser, Warmwasserenergie unbekannt. */
  | 'hot_water_energy_unknown'

/** Vergleich mit dem normierten Durchschnittsnutzer (§ 6a Abs. 2 Nr. 2). */
export type MonthlyAverageUserComparison =
  | {
      status: 'compared'
      /**
       * Durchschnitt = Mitte der Klasse „mittel“ des Heizspiegels
       * (OFFENE ANNAHME E-46-3).
       */
      method: 'heizspiegel_medium_midpoint'
      /**
       * `true`, wenn die Vergleichswerte Warmwasser enthalten: der
       * Warmwasseranteil wird wie Heizung nach Gradtagen auf den Monat
       * verteilt (Näherung).
       */
      approximation: boolean
      includesHotWater: boolean
      source: string
      category: string
      referenceYear: number
      benchmarkKwhPerSqmYear: number
      areaSqm: number
      areaBasis: 'heated_area' | 'usable_area'
      /** Gradtagsanteil des Nutzungszeitraums im Monat in Promille. */
      degreeDayPermille: number
      /** Durchschnittsnutzer im Nutzungszeitraum, ganze kWh. */
      value: number
      /** Eigener Verbrauch (Heizung bzw. Heizung + Warmwasser), ganze kWh. */
      ownKwh: number | null
    }
  | {
      status: 'unavailable'
      value: null
      reason: MonthlyAverageUserUnavailableReason
    }

/** Monatsinformation je Mieter-Nutzungszeitraum. */
export interface MonthlyTenantConsumption {
  occupancyPeriodId: string
  tenancyId: string | null
  unitId: string
  heatingCircuitId: string | null
  /** Teilzeitraum der Nutzung, auf den Monat begrenzt. */
  from: string
  to: string
  days: number
  /** Aufteilung Heizung nach Gradtagszahlen (VDI 2067, ADR-0007). */
  heatingAllocation: 'degree_days'
  /** Aufteilung Warmwasser nach Kalendertagen. */
  hotWaterAllocation: 'days'
  /** Anteil am Monatsverbrauch der Einheit (Heizung), vier Nachkommastellen. */
  heatingShare: number
  /** Anteil am Monatsverbrauch der Einheit (Warmwasser), vier Nachkommastellen. */
  hotWaterShare: number
  heating: MonthlyHeatingInformation
  /** `null`, wenn kein zentrales Warmwasser oder kein Warmwasserzähler. */
  hotWater: MonthlyHotWaterInformation | null
  averageUser: MonthlyAverageUserComparison
}

export interface MonthlyInformationIssue {
  code: string
  detail: string
  heatingCircuitId?: string
  meterId?: string
  unitId?: string
  occupancyPeriodId?: string
  readingIds?: string[]
}

/** Offene fachliche Annahme, die das Ergebnis beeinflusst. */
export interface MonthlyInformationAssumption {
  code: 'E-46-3' | 'hot_water_temperature'
  detail: string
}

export interface MonthlyConsumptionInformation {
  propertyId: string
  /** `YYYY-MM`. */
  month: string
  from: string
  to: string
  billingPeriodId: string | null
  tenants: MonthlyTenantConsumption[]
  assumptions: MonthlyInformationAssumption[]
  issues: MonthlyInformationIssue[]
}

export interface MonthlyConsumptionInformationInput {
  propertyId: string
  /** Kalendermonat `YYYY-MM`. */
  month: string
}
