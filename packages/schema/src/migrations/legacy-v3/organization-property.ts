import type { LegacyUnmappedEntry, V3Abrechnung, V3File, V3Objekt } from '../..'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { mapBillingPeriod } from './billing-tenancy-costs'
import { requiredString } from './mapping'
import { mapBookings, mapMeters } from './meters-bookings-audit'
import type { PropertyContext } from './shared'
import { stringOrNullish, withLegacy } from './shared'
import type { MigrationState } from './state'
import { addUnmapped, preserveUnknownKeys } from './unknown-fields'

export function mapCompany(
  state: MigrationState,
  context: MigrationContext,
  company: V3File['firmen'][number],
  companyIndex: number,
  organizationId: string,
): void {
  const path: JsonPath = ['firmen', companyIndex]
  const legacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    company,
    [
      'id',
      'name1',
      'name2',
      'name3',
      'name4',
      'strasse',
      'plz_ort',
      'postfach',
      'ansprechpartner',
      'bank',
      'objekte',
    ],
    legacy,
    path,
  )
  if (company.ansprechpartner)
    preserveUnknownKeys(
      context,
      company.ansprechpartner,
      ['anrede', 'vorname', 'name', 'telefon', 'mobil', 'fax', 'email'],
      legacy,
      [...path, 'ansprechpartner'],
      ['ansprechpartner'],
    )
  if (company.bank)
    preserveUnknownKeys(
      context,
      company.bank,
      ['iban', 'bic', 'kontoinhaber', 'kreditinstitut'],
      legacy,
      [...path, 'bank'],
      ['bank'],
    )
  const name = requiredString(
    context,
    company.name1,
    [...path, 'name1'],
    'Der Name einer Eigentümergesellschaft fehlt',
  )
  const contactSalutation = company.ansprechpartner?.anrede
  const salutation =
    contactSalutation == null ||
    contactSalutation === 'Herr' ||
    contactSalutation === 'Frau' ||
    contactSalutation === 'Familie' ||
    contactSalutation === 'Firma'
      ? contactSalutation
      : undefined
  if (contactSalutation != null && salutation === undefined) {
    context.issue(
      'warning',
      'migration.unknown_salutation',
      'Eine unbekannte Anrede wurde nicht übernommen',
      [...path, 'ansprechpartner', 'anrede'],
    )
    addUnmapped(
      context,
      legacy,
      ['ansprechpartner', 'anrede'],
      [...path, 'ansprechpartner', 'anrede'],
      contactSalutation,
    )
  }
  if (name) {
    const ownerCompanyIndex = state.ownerCompanies.length
    context.change(
      [...path, 'id'],
      ['masterData', 'ownerCompanies', ownerCompanyIndex, 'id'],
      'verbatim',
    )
    context.change(
      [...path, 'name1'],
      ['masterData', 'ownerCompanies', ownerCompanyIndex, 'name'],
      'verbatim',
    )
    context.change(
      ['organization'],
      ['masterData', 'ownerCompanies', ownerCompanyIndex, 'organizationId'],
      'tree_position_to_fk',
    )
    if (legacy.length > 0)
      context.change(
        path,
        ['masterData', 'ownerCompanies', ownerCompanyIndex, 'legacyUnmapped'],
        'preserve_unknown',
      )
    const additionalNameLines = [company.name2, company.name3, company.name4]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
      .slice(0, 3)
    state.ownerCompanies = [
      ...state.ownerCompanies,
      withLegacy(
        {
          id: company.id,
          organizationId,
          name,
          additionalNameLines,
          address:
            company.strasse != null || company.plz_ort != null
              ? {
                  street: stringOrNullish(company.strasse),
                  postalCodeAndCity: stringOrNullish(company.plz_ort),
                }
              : undefined,
          postBox: stringOrNullish(company.postfach),
          contact: company.ansprechpartner
            ? {
                salutation,
                firstName: stringOrNullish(company.ansprechpartner.vorname),
                lastName: stringOrNullish(company.ansprechpartner.name),
                phone: stringOrNullish(company.ansprechpartner.telefon),
                mobile: stringOrNullish(company.ansprechpartner.mobil),
                fax: stringOrNullish(company.ansprechpartner.fax),
                email: stringOrNullish(company.ansprechpartner.email),
              }
            : undefined,
          bankAccount: company.bank
            ? {
                iban: stringOrNullish(company.bank.iban),
                bic: stringOrNullish(company.bank.bic),
                accountHolder: stringOrNullish(company.bank.kontoinhaber),
                bankName: stringOrNullish(company.bank.kreditinstitut),
              }
            : undefined,
        },
        legacy,
      ),
    ]
  }
  for (const [objectIndex, object] of (company.objekte ?? []).entries())
    mapProperty(
      state,
      context,
      object,
      objectIndex,
      companyIndex,
      company.id,
      organizationId,
    )
}

function normalizedBillingPeriods(
  context: MigrationContext,
  object: V3Objekt,
  path: JsonPath,
  propertyLegacy: LegacyUnmappedEntry[],
): { value: V3Abrechnung; path: JsonPath }[] {
  if (object.abrechnungen && object.abrechnungen.length > 0) {
    const rootFields = [
      'jahr',
      'zeitraum',
      'vorgaben',
      'gesamt',
      'nutzer',
      'kostenarten',
      'heizkreise',
      'brennstoff',
      'co2',
      'hinweise',
      'standardKostenartenStatus',
    ] as const
    for (const key of rootFields) {
      const value = object[key]
      if (value !== undefined) {
        context.issue(
          'warning',
          'migration.historical_root_conflict',
          'Historische Jahresdaten neben abrechnungen wurden nur konserviert',
          [...path, key],
        )
        addUnmapped(context, propertyLegacy, [key], [...path, key], value)
      }
    }
    return object.abrechnungen.map((value, index) => ({
      value,
      path: [...path, 'abrechnungen', index],
    }))
  }
  const hasHistoricalData = [
    object.jahr,
    object.zeitraum,
    object.nutzer,
    object.kostenarten,
    object.heizkreise,
    object.brennstoff,
    object.co2,
  ].some((value) => value !== undefined)
  if (!hasHistoricalData) return []
  context.issue(
    'info',
    'migration.historical_root_layout',
    'Historische Jahresdaten wurden in eine Abrechnungsperiode gehoben',
    path,
  )
  const value = {
    id: context.id([...path, 'historical_billing_period']),
    jahr: object.jahr,
    zeitraum: object.zeitraum as V3Abrechnung['zeitraum'],
    vorgaben: object.vorgaben,
    gesamt: object.gesamt as V3Abrechnung['gesamt'],
    nutzer: object.nutzer,
    kostenarten: object.kostenarten,
    heizkreise: object.heizkreise,
    brennstoff: object.brennstoff,
    co2: object.co2,
    hinweise: object.hinweise as V3Abrechnung['hinweise'],
    standardKostenartenStatus:
      object.standardKostenartenStatus as V3Abrechnung['standardKostenartenStatus'],
  } as V3Abrechnung
  return [{ value, path }]
}

function collectBuildingIds(
  object: V3Objekt,
  periods: { value: V3Abrechnung }[],
): string[] {
  const ids = new Set((object.bloecke ?? []).map(({ id }) => id))
  for (const { value } of periods) {
    for (const circuit of value.heizkreise ?? []) ids.add(circuit.id)
    if (value.brennstoff && ids.size === 0) ids.add('B1')
  }
  return [...ids]
}

function mapProperty(
  state: MigrationState,
  context: MigrationContext,
  object: V3Objekt,
  objectIndex: number,
  companyIndex: number,
  ownerCompanyId: string,
  organizationId: string,
): void {
  const path: JsonPath = ['firmen', companyIndex, 'objekte', objectIndex]
  const propertyLegacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    object,
    [
      'id',
      'eigene_nr',
      'objekt_nr',
      'strasse',
      'plz_ort',
      'iban',
      'kontoinhaber',
      'bloecke',
      'stromzaehler',
      'buchungen',
      'abrechnungen',
      'standardKostenartenStatus',
      'excel_quelle',
      '_betrKVNumFix',
      '_betrKVNumFixInfo',
      'jahr',
      'zeitraum',
      'vorgaben',
      'gesamt',
      'nutzer',
      'kostenarten',
      'heizkreise',
      'brennstoff',
      'co2',
      'hinweise',
    ],
    propertyLegacy,
    path,
  )
  for (const key of ['_betrKVNumFix', '_betrKVNumFixInfo'] as const)
    if (object[key] !== undefined)
      addUnmapped(context, propertyLegacy, [key], [...path, key], object[key])
  const periods = normalizedBillingPeriods(
    context,
    object,
    path,
    propertyLegacy,
  )
  const propertyIndex = state.properties.length
  context.change(
    [...path, 'id'],
    ['masterData', 'properties', propertyIndex, 'id'],
    'verbatim',
  )
  context.change(
    ['firmen', companyIndex, 'id'],
    ['masterData', 'properties', propertyIndex, 'ownerCompanyId'],
    'tree_position_to_fk',
  )
  state.properties = [
    ...state.properties,
    withLegacy(
      {
        id: object.id,
        ownerCompanyId,
        internalNumber: stringOrNullish(object.eigene_nr),
        externalNumber: stringOrNullish(object.objekt_nr),
        address:
          object.strasse != null || object.plz_ort != null
            ? {
                street: stringOrNullish(object.strasse),
                postalCodeAndCity: stringOrNullish(object.plz_ort),
              }
            : undefined,
        bankAccount:
          object.iban != null || object.kontoinhaber != null
            ? {
                iban: stringOrNullish(object.iban),
                accountHolder: stringOrNullish(object.kontoinhaber),
              }
            : undefined,
        legacySourceInfo: object.excel_quelle,
      },
      propertyLegacy,
    ),
  ]
  const collectedBuildingIds = collectBuildingIds(object, periods)
  const buildingIds = new Map<string, string>()
  const blocksById = new Map(
    (object.bloecke ?? []).map((block, index) => [block.id, { block, index }]),
  )
  for (const legacyId of collectedBuildingIds)
    buildingIds.set(legacyId, `${object.id}:${legacyId}`)
  for (const [blockIndex, legacyId] of collectedBuildingIds.entries()) {
    const blockEntry = blocksById.get(legacyId)
    const block = blockEntry?.block
    const blockPath = blockEntry
      ? [...path, 'bloecke', blockEntry.index]
      : [...path, 'derived_blocks', blockIndex]
    const legacy: LegacyUnmappedEntry[] = []
    if (block) {
      preserveUnknownKeys(
        context,
        block,
        ['id', 'name', 'kuerzel', 'energietraeger', 'prefix', 'hk'],
        legacy,
        blockPath,
      )
      if (block.hk !== undefined) {
        context.drop(
          [...blockPath, 'hk'],
          'Redundanter Anzeige-Alias der Block-ID',
          block.hk,
        )
        addUnmapped(context, legacy, ['hk'], [...blockPath, 'hk'], block.hk)
      }
    } else
      context.issue(
        'info',
        'migration.building_derived',
        'Ein fehlender Gebäudeblock wurde aus einem Heizkreis abgeleitet',
        blockPath,
      )
    const buildingIndex = state.buildings.length
    context.change(
      [...blockPath, 'id'],
      ['masterData', 'buildings', buildingIndex, 'id'],
      'tree_position_to_fk',
    )
    context.change(
      [...path, 'id'],
      ['masterData', 'buildings', buildingIndex, 'propertyId'],
      'tree_position_to_fk',
    )
    if (legacy.length > 0)
      context.change(
        blockPath,
        ['masterData', 'buildings', buildingIndex, 'legacyUnmapped'],
        'preserve_unknown',
      )
    state.buildings = [
      ...state.buildings,
      withLegacy(
        {
          id: buildingIds.get(legacyId)!,
          propertyId: object.id,
          name: block?.name || `Heizkreis ${legacyId}`,
          shortName: stringOrNullish(block?.kuerzel),
          defaultEnergySourceType: stringOrNullish(block?.energietraeger),
          mandateRefPrefixes: block?.prefix ?? [],
        },
        legacy,
      ),
    ]
  }
  const heatingSystemId = context.id([...path, 'heating_system'])
  context.change(
    path,
    ['masterData', 'heatingSystems', state.heatingSystems.length, 'id'],
    'id_generate',
  )
  state.heatingSystems = [
    ...state.heatingSystems,
    { id: heatingSystemId, propertyId: object.id },
  ]
  const billingPeriodsByYear = new Map<number, string>()
  const propertyContext: PropertyContext = {
    propertyId: object.id,
    organizationId,
    heatingSystemId,
    buildingIds,
    billingPeriodsByYear,
  }
  for (const period of periods) {
    const year = mapBillingPeriod(
      state,
      context,
      period.value,
      period.path,
      propertyContext,
    )
    if (year !== undefined) billingPeriodsByYear.set(year, period.value.id)
  }
  mapMeters(
    state,
    context,
    object.stromzaehler ?? [],
    [...path, 'stromzaehler'],
    propertyContext,
  )
  mapBookings(
    state,
    context,
    object.buchungen ?? [],
    [...path, 'buchungen'],
    propertyContext,
  )
}
