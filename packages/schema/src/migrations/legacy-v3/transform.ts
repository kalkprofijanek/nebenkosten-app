import type { LegacyUnmappedEntry, V3File } from '../..'
import { MigrationContext } from './context'
import { mapCompany } from './organization-property'
import {
  appendAllocationRules,
  mapOrganizationName,
  withLegacy,
} from './shared'
import type { MigrationState } from './state'
import { createMigrationState } from './state'
import { preserveUnknownKeys } from './unknown-fields'

export function transformV3File(
  input: V3File,
  context: MigrationContext,
): MigrationState {
  const state = createMigrationState()
  const organizationId = context.id(['organization'])
  const rootLegacy: LegacyUnmappedEntry[] = []
  preserveUnknownKeys(
    context,
    input,
    ['version', 'gespeichert', 'firmen'],
    rootLegacy,
    [],
  )
  context.change(['version'], ['schemaVersion'], 'verbatim')
  context.change(['gespeichert'], ['meta', 'savedAt'], 'date_to_iso')
  context.change(
    ['version'],
    ['meta', 'migratedFrom', 'schemaVersion'],
    'verbatim',
  )
  context.change(
    ['organization'],
    ['masterData', 'organizations', 0, 'id'],
    'id_generate',
  )
  if (rootLegacy.length > 0)
    context.change(
      ['<unknown-root-field>'],
      ['masterData', 'organizations', 0, 'legacyUnmapped'],
      'preserve_unknown',
    )
  state.organizations = [
    withLegacy(
      { id: organizationId, name: mapOrganizationName(context) },
      rootLegacy,
    ),
  ]
  appendAllocationRules(state, context, organizationId)
  for (const [companyIndex, company] of input.firmen.entries())
    mapCompany(state, context, company, companyIndex, organizationId)
  return state
}
