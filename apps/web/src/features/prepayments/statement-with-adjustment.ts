import {
  appendPrepaymentAdjustment,
  buildTenantStatement,
  type TenantStatementContext,
} from '@nebenkosten/pdf'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { acceptedAdjustmentLetter } from './adjustment'

/**
 * Einzelabrechnung; bei einer gespeicherten „Ja“-Entscheidung zur
 * VZ-Anpassung folgt das Anpassungsschreiben als eigene Seite.
 */
export function buildTenantStatementWithAdjustment(
  context: TenantStatementContext,
): TDocumentDefinitions {
  const statement = buildTenantStatement(context)
  const letter = acceptedAdjustmentLetter(
    context.appData,
    context.billingPeriod,
    context.calculation,
    context.occupancyPeriod.id,
  )
  return letter
    ? appendPrepaymentAdjustment(statement, context, letter)
    : statement
}
