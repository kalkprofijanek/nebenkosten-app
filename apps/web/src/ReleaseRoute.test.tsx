import {
  createEmptyAppDataFile,
  type AppDataFile,
  type BillingPeriodStatus,
  type ValidationIssue,
} from '@nebenkosten/schema'
import {
  getFinalizationDocumentStatus,
  transitionBillingPeriod,
  validateBillingPeriod,
} from '@nebenkosten/validators'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReleaseRoute } from './ReleaseRoute'

vi.mock('@nebenkosten/validators', () => ({
  getFinalizationDocumentStatus: vi.fn(),
  validateBillingPeriod: vi.fn(),
  transitionBillingPeriod: vi.fn(),
}))

afterEach(cleanup)

const errorIssue: ValidationIssue & { readonly key: string } = {
  key: 'error:cost-1',
  severity: 'error',
  code: 'costs.missing_document',
  area: 'costs',
  title: 'Beleg fehlt',
  detail: 'Kostenposition prüfen.',
  entity: { type: 'cost_entry', id: 'cost-1' },
}
const warningOne: ValidationIssue & { readonly key: string } = {
  key: 'warning:tenant-1',
  severity: 'warning',
  code: 'prepayments.missing',
  area: 'prepayments',
  title: 'Vorauszahlung fehlt',
  entity: { type: 'occupancy_period', id: 'tenant-1' },
}
const warningTwo = {
  ...warningOne,
  key: 'warning:tenant-2',
  entity: { type: 'occupancy_period', id: 'tenant-2' },
}

function fileWithPeriod(status: BillingPeriodStatus): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'period-1',
          propertyId: 'property-1',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status,
        },
      ],
      auditEvents: [
        {
          id: 'audit-1',
          billingPeriodId: 'period-1',
          timestamp: '2026-07-20T10:00:00.000Z',
          action: 'billing_period.review_started',
          details: { reason: 'darf nicht in der Oberfläche erscheinen' },
        },
      ],
    },
  }
}

function report(
  issues = [errorIssue, warningOne, warningTwo],
  confirmedWarningKeys: readonly string[] = [],
) {
  const warnings = issues.filter(({ severity }) => severity === 'warning')
  const unconfirmedWarningKeys = warnings
    .map(({ key }) => key)
    .filter((key) => !confirmedWarningKeys.includes(key))
  return {
    billingPeriodId: 'period-1',
    issues,
    errorCount: issues.filter(({ severity }) => severity === 'error').length,
    warningCount: warnings.length,
    infoCount: issues.filter(({ severity }) => severity === 'info').length,
    unconfirmedWarningKeys,
    canBecomeReady:
      issues.every(({ severity }) => severity !== 'error') &&
      unconfirmedWarningKeys.length === 0,
  }
}

describe('ReleaseRoute', () => {
  beforeEach(() => {
    vi.mocked(getFinalizationDocumentStatus).mockReturnValue({
      complete: true,
      calculationRunId: 'run-1',
      missingCombinedStatement: false,
      missingTenantStatementCount: 0,
    })
    vi.mocked(validateBillingPeriod).mockImplementation((data, id, options) => {
      void data
      void id
      return report(
        [errorIssue, warningOne, warningTwo],
        options?.confirmedWarningKeys,
      )
    })
    vi.mocked(transitionBillingPeriod).mockImplementation(
      (data, id, target) => ({
        ...(data as AppDataFile),
        billingData: {
          ...(data as AppDataFile).billingData,
          billingPeriods: (data as AppDataFile).billingData.billingPeriods.map(
            (period) =>
              period.id === id ? { ...period, status: target } : period,
          ),
        },
      }),
    )
  })

  it('zeigt ohne gewählten Zeitraum einen Leerzustand', () => {
    render(
      <ReleaseRoute
        data={createEmptyAppDataFile()}
        billingPeriodId={null}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText(/Objekt und ein Abrechnungsjahr/)).toBeVisible()
    expect(validateBillingPeriod).not.toHaveBeenCalled()
  })

  it('gruppiert Status, Zähler und Befunde nach Schwere und Bereich', () => {
    render(
      <ReleaseRoute
        data={fileWithPeriod('IN_REVIEW')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('In Prüfung')).toBeVisible()
    expect(screen.getByText('1 Fehler')).toBeVisible()
    expect(screen.getByText('2 Warnungen')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: /Fehler.*Kosten/i })).getByText(
        'Beleg fehlt',
      ),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('region', { name: /Warnungen.*Vorauszahlungen/i }),
      ).getAllByText('Vorauszahlung fehlt'),
    ).toHaveLength(2)
  })

  it('verlinkt jeden Prüfhinweis direkt in den passenden Arbeitsbereich', () => {
    render(
      <ReleaseRoute
        data={fileWithPeriod('IN_REVIEW')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    const costLink = within(
      screen.getByRole('region', { name: /Fehler.*Kosten/i }),
    ).getByRole('link', { name: 'Kosten bearbeiten' })
    expect(costLink).toHaveAttribute('href', '#/kosten')
    expect(costLink).toHaveAttribute('data-entity-id', 'cost-1')

    const prepaymentLinks = within(
      screen.getByRole('region', { name: /Warnungen.*Vorauszahlungen/i }),
    ).getAllByRole('link', { name: 'Nutzer bearbeiten' })
    expect(prepaymentLinks).toHaveLength(2)
    expect(prepaymentLinks[0]).toHaveAttribute('href', '#/nutzer')
    expect(prepaymentLinks[0]).toHaveAttribute('data-entity-id', 'tenant-1')
  })

  it('startet aus DRAFT die Prüfung über den Statusautomaten', () => {
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      transform(fileWithPeriod('DRAFT'))
      return true
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('DRAFT')}
        billingPeriodId="period-1"
        onApply={onApply}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prüfung starten' }))
    expect(transitionBillingPeriod).toHaveBeenCalledWith(
      expect.anything(),
      'period-1',
      'IN_REVIEW',
      undefined,
    )
  })

  it('bestätigt gleichartige Warnungen instanzgenau und gibt erst alle frei', () => {
    vi.mocked(validateBillingPeriod).mockImplementation((data, id, options) => {
      void data
      void id
      return report([warningOne, warningTwo], options?.confirmedWarningKeys)
    })
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      transform(fileWithPeriod('IN_REVIEW'))
      return true
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('IN_REVIEW')}
        billingPeriodId="period-1"
        onApply={onApply}
      />,
    )
    const boxes = screen.getAllByRole('checkbox', {
      name: /Vorauszahlung fehlt/,
    })
    const button = screen.getByRole('button', { name: 'Für PDF freigeben' })
    fireEvent.click(boxes[0]!)
    expect(button).toBeDisabled()
    fireEvent.click(boxes[1]!)
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(transitionBillingPeriod).toHaveBeenCalledWith(
      expect.anything(),
      'period-1',
      'READY_FOR_PDF',
      {
        confirmedWarningKeys: ['warning:tenant-1', 'warning:tenant-2'],
      },
    )
  })

  it('verweist ohne gespeicherten Rechenlauf auf die Neuberechnung', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    vi.mocked(getFinalizationDocumentStatus).mockReturnValue({
      complete: false,
      missingCombinedStatement: true,
      missingTenantStatementCount: 1,
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('IN_REVIEW')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText(/Aktuelle Berechnung fehlt/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Jetzt neu berechnen' }),
    ).toHaveAttribute('href', '#/berechnung')
    expect(
      screen.getByRole('button', { name: 'Für PDF freigeben' }),
    ).toBeDisabled()
  })

  it('fordert beim kontrollierten Wiederöffnen einen Grund', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      transform(fileWithPeriod('READY_FOR_PDF'))
      return true
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('READY_FOR_PDF')}
        billingPeriodId="period-1"
        onApply={onApply}
      />,
    )
    expect(screen.getByText(/PDF-Ausgabe bereit/)).toBeVisible()
    const button = screen.getByRole('button', { name: 'Wieder öffnen' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Grund für das Wiederöffnen'), {
      target: { value: 'Neue Ablesung liegt vor.' },
    })
    fireEvent.click(button)
    expect(transitionBillingPeriod).toHaveBeenCalledWith(
      expect.anything(),
      'period-1',
      'IN_REVIEW',
      {
        reason: 'Neue Ablesung liegt vor.',
      },
    )
  })

  it('finalisiert erst mit gültigem Versanddatum', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    const onApply = vi.fn((transform: (data: AppDataFile) => AppDataFile) => {
      transform(fileWithPeriod('READY_FOR_PDF'))
      return true
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('READY_FOR_PDF')}
        billingPeriodId="period-1"
        onApply={onApply}
      />,
    )
    const button = screen.getByRole('button', { name: 'Finalisieren' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Versanddatum'), {
      target: { value: '2026-02-15' },
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(transitionBillingPeriod).toHaveBeenCalledWith(
      expect.anything(),
      'period-1',
      'FINALIZED',
      { dispatchDate: '2026-02-15' },
    )
  })

  it('hält Abschluss und Endstatus schreibgeschützt und meldet Fehler zugänglich', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    const data = fileWithPeriod('READY_FOR_PDF')
    const { rerender } = render(
      <ReleaseRoute
        data={data}
        billingPeriodId="period-1"
        onApply={() => false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Finalisieren' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Grund für das Wiederöffnen'), {
      target: { value: 'Korrektur nötig.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Wieder öffnen' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/nicht gespeichert/)

    rerender(
      <ReleaseRoute
        data={fileWithPeriod('FINALIZED')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('Finalisiert')).toBeVisible()
    expect(screen.getByText(/schreibgeschützt/)).toBeVisible()
    rerender(
      <ReleaseRoute
        data={fileWithPeriod('SUPERSEDED')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('Ersetzt')).toBeVisible()
  })

  it('zeigt einen geworfenen Statusfehler als Alert', () => {
    vi.mocked(transitionBillingPeriod).mockImplementation(() => {
      throw new Error('Statuswechsel ist nicht zulässig.')
    })
    const data = fileWithPeriod('DRAFT')
    render(
      <ReleaseRoute
        data={data}
        billingPeriodId="period-1"
        onApply={(transform) => {
          transform(data)
          return true
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prüfung starten' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Statuswechsel ist nicht zulässig.',
    )
  })

  it('blockiert die Finalisierung bis alle aktuellen Dokumente erzeugt sind', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    vi.mocked(getFinalizationDocumentStatus).mockReturnValue({
      complete: false,
      calculationRunId: 'run-1',
      missingCombinedStatement: true,
      missingTenantStatementCount: 2,
    })
    render(
      <ReleaseRoute
        data={fileWithPeriod('READY_FOR_PDF')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText(/Gesamtabrechnung fehlt/)).toBeVisible()
    expect(screen.getByText(/2 Einzelabrechnungen fehlen/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Fehlende Dokumente erzeugen' }),
    ).toHaveAttribute('href', '#/pdf-export')
    fireEvent.change(screen.getByLabelText('Versanddatum'), {
      target: { value: '2026-02-15' },
    })
    expect(screen.getByRole('button', { name: 'Finalisieren' })).toBeDisabled()
  })

  it('zeigt ungültige Dokumentdaten als Fehler statt die Route abstürzen zu lassen', () => {
    vi.mocked(validateBillingPeriod).mockReturnValue(report([]))
    vi.mocked(getFinalizationDocumentStatus).mockImplementation(() => {
      throw new Error('Dokumentenstatus konnte nicht geprüft werden.')
    })

    render(
      <ReleaseRoute
        data={fileWithPeriod('READY_FOR_PDF')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Dokumentenstatus konnte nicht geprüft werden.',
    )
  })

  it('zeigt Audit-Historie ohne variable Details', () => {
    render(
      <ReleaseRoute
        data={fileWithPeriod('IN_REVIEW')}
        billingPeriodId="period-1"
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('billing_period.review_started')).toBeVisible()
    expect(screen.queryByText(/darf nicht/)).not.toBeInTheDocument()
  })
})
