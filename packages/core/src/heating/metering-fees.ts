/**
 * Entgelte für Verbrauchserfassung und Abrechnung (§ 6a Abs. 3 Nr. 1c
 * HeizKV) in den Betriebskosten der Heizungsanlage eines Heizkreises.
 *
 * Maßgeblich ist das Kennzeichen `CostCategory.meteringFee`: `true` zählt
 * die ganze Kostenart, `false` schließt sie aus. Ohne Kennzeichen gilt die
 * bisherige Erkennung über Schlagworte in Bezeichnung, Abrechnungstext und
 * Belegbeschreibung (ADR-0006).
 */
import type { AppDataFile, CostCategory } from '@nebenkosten/schema'

/**
 * Schlagworte für Entgelte der Verbrauchserfassung. „Abrechnung“ zählt nur
 * als Heizkosten-/Verbrauchsabrechnung oder Abrechnungsentgelt – nicht z. B.
 * eine Erwerber- oder Energieabrechnung mit Brennstoffkosten.
 */
export const METERING_FEE_PATTERN =
  /w(?:ä|ae)rmez(?:ä|ae)hler|heizkostenverteiler|messdienst|ablesung|(?:heizkosten|w(?:ä|ae)rmekosten|verbrauchs)abrechnung|abrechnungs(?:dienst|entgelt|geb(?:ü|ue)hr|kosten)|eichung|verbrauchserfassung|ger(?:ä|ae)temiete|z(?:ä|ae)hlermiete/iu

/** Betriebskosten der Heizungsanlage: Kostenarten „Heizung“ des Gebäudes. */
function heatingOperatingCategories(
  data: Readonly<AppDataFile>,
  billingPeriodId: string,
  buildingId: string,
): CostCategory[] {
  return data.billingData.costCategories.filter(
    (category) =>
      category.billingPeriodId === billingPeriodId &&
      category.kind === 'heating' &&
      category.scope?.kind === 'building' &&
      category.scope.buildingId === buildingId,
  )
}

/** Kostenart nach Kennzeichen oder, ohne Kennzeichen, nach Schlagworten. */
export function isMeteringFeeCategory(category: Readonly<CostCategory>) {
  return (
    category.meteringFee ??
    METERING_FEE_PATTERN.test(
      `${category.label} ${category.statementText ?? ''}`,
    )
  )
}

/**
 * Summe der Entgelte in den Heizungs-Betriebskosten des Heizkreises;
 * `null`, wenn keine Kostenposition gekennzeichnet oder erkennbar ist.
 */
export function meteringFeeCents(
  data: Readonly<AppDataFile>,
  billingPeriodId: string,
  buildingId: string,
): number | null {
  let found = false
  let total = 0
  for (const category of heatingOperatingCategories(
    data,
    billingPeriodId,
    buildingId,
  )) {
    if (category.meteringFee === false) continue
    const entries = data.billingData.costEntries.filter(
      ({ costCategoryId }) => costCategoryId === category.id,
    )
    const categoryMatches = isMeteringFeeCategory(category)
    if (entries.length === 0) {
      if (categoryMatches && category.totalAmountCents) {
        found = true
        total += category.totalAmountCents
      }
      continue
    }
    for (const entry of entries)
      if (
        categoryMatches ||
        METERING_FEE_PATTERN.test(entry.description ?? '')
      ) {
        found = true
        total += entry.amountCents
      }
  }
  return found ? total : null
}
