import type { AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import { decidePrepaymentAdjustment } from './adjustment'
import { buildPrepaymentOverview } from './overview'
import { PrepaymentsRoute } from './PrepaymentsRoute'
import { scenarios, settledYear, withFollowYear } from './prepayment-fixture'

afterEach(cleanup)

const today = () => new Date(2025, 2, 10)

function withPreviousYear(data: AppDataFile): AppDataFile {
  const settled = data.billingData.billingPeriods[0]!
  return {
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: [
        ...data.billingData.billingPeriods,
        {
          ...settled,
          id: 'bp-0',
          year: 2023,
          periodStart: '2023-01-01',
          periodEnd: '2023-12-31',
        },
      ],
      occupancyPeriods: [
        ...data.billingData.occupancyPeriods,
        {
          id: 'op-t1-2023',
          billingPeriodId: 'bp-0',
          unitId: 'u1',
          tenancyId: 'ten-t1',
          kind: 'tenant',
        },
        {
          id: 'op-t2-2023',
          billingPeriodId: 'bp-0',
          unitId: 'u2',
          tenancyId: 'ten-t2',
          kind: 'tenant',
        },
      ],
      prepayments: [
        ...data.billingData.prepayments,
        {
          id: 'pp-t1-2023',
          occupancyPeriodId: 'op-t1-2023',
          mode: 'monthly',
          monthlyAmountCents: 4000,
        },
        {
          id: 'pp-t2-2023',
          occupancyPeriodId: 'op-t2-2023',
          mode: 'annual',
          annualAmountCents: 48000,
        },
      ],
    },
  }
}

function Harness({
  initial,
  billingPeriodId = 'bp-1',
  onChange,
}: {
  readonly initial: AppDataFile
  readonly billingPeriodId?: string | null
  readonly onChange?: (data: AppDataFile) => void
}) {
  const [data, setData] = useState(initial)
  return (
    <PrepaymentsRoute
      data={data}
      billingPeriodId={billingPeriodId}
      today={today}
      onApply={(transform) => {
        const next = transform(data)
        setData(next)
        onChange?.(next)
        return true
      }}
    />
  )
}

function overviewTable() {
  return screen.getByRole('table', { name: 'Vorauszahlungen' })
}

function rowOf(table: HTMLElement, text: string) {
  return within(table).getByText(text).closest('tr')!
}

describe('buildPrepaymentOverview', () => {
  it('berechnet Jahressoll, Vorjahr, Differenz und Summen', () => {
    const overview = buildPrepaymentOverview(
      withPreviousYear(settledYear()),
      'bp-1',
    )!
    expect(overview.previousPeriod?.year).toBe(2023)
    expect(overview.rows.map((row) => row.unitLabel)).toEqual([
      'Einheit u1',
      'Einheit u2',
    ])
    expect(overview.rows[0]).toMatchObject({
      tenantName: 'Mieter T1',
      monthlyCents: 5000,
      annualTargetCents: 60000,
      differenceCents: 1000,
      previous: { year: 2023, monthlyCents: 4000 },
    })
    expect(overview.rows[1]).toMatchObject({
      differenceCents: null,
      previous: { monthlyCents: null },
    })
    expect(overview.totals).toEqual({
      monthlyCents: 9000,
      annualTargetCents: 108000,
      previousMonthlyCents: 4000,
      differenceCents: 1000,
    })
    expect(buildPrepaymentOverview(settledYear(), 'fehlt')).toBeNull()
  })
})

describe('PrepaymentsRoute – Übersicht', () => {
  it('zeigt alle Mieter mit Vorjahr, Differenz und Summenzeile', () => {
    render(<Harness initial={withPreviousYear(settledYear())} />)
    const table = overviewTable()
    const first = rowOf(table, 'Einheit u1')
    expect(within(first).getByText('Mieter T1')).toBeVisible()
    expect(within(first).getByText('01.01.2024 – 31.12.2024')).toBeVisible()
    expect(within(first).getByText('600,00 €')).toBeVisible()
    expect(within(first).getByText('40,00 €')).toBeVisible()
    expect(within(first).getByText('+10,00 €')).toBeVisible()
    const second = rowOf(table, 'Einheit u2')
    expect(within(second).getByText('480,00 € / Jahr')).toBeVisible()
    const footer = within(table).getByText('Summe (2)').closest('tr')!
    expect(within(footer).getByText('90,00 €')).toBeVisible()
    expect(within(footer).getByText('1.080,00 €')).toBeVisible()
  })

  it('speichert einen geänderten Monatsbetrag je Zeile', () => {
    const onChange = vi.fn()
    render(<Harness initial={settledYear()} onChange={onChange} />)
    const save = screen.getByRole('button', {
      name: 'Vorauszahlung speichern Einheit u1 Mieter T1',
    })
    expect(save).toBeDisabled()
    fireEvent.change(
      screen.getByLabelText('Monatsbetrag Einheit u1 Mieter T1'),
      { target: { value: '55,50' } },
    )
    fireEvent.click(save)
    const saved: AppDataFile = onChange.mock.calls.at(-1)![0]
    expect(
      saved.billingData.prepayments.find(({ id }) => id === 'pp-t1'),
    ).toMatchObject({ mode: 'monthly', monthlyAmountCents: 5550 })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Vorauszahlung für Einheit u1 (Mieter T1) gespeichert.',
    )
    expect(
      within(rowOf(overviewTable(), 'Einheit u1')).getByText('666,00 €'),
    ).toBeVisible()
  })

  it('wechselt den Modus und meldet ungültige Beträge', () => {
    const onChange = vi.fn()
    render(<Harness initial={settledYear()} onChange={onChange} />)
    const mode = screen.getByLabelText('Modus Einheit u2 Mieter T2')
    fireEvent.change(mode, { target: { value: 'annual' } })
    fireEvent.change(
      screen.getByLabelText('Jahresbetrag Einheit u2 Mieter T2'),
      {
        target: { value: 'abc' },
      },
    )
    const save = screen.getByRole('button', {
      name: 'Vorauszahlung speichern Einheit u2 Mieter T2',
    })
    fireEvent.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte einen gültigen Eurobetrag eingeben.',
    )
    fireEvent.change(
      screen.getByLabelText('Jahresbetrag Einheit u2 Mieter T2'),
      {
        target: { value: '-5' },
      },
    )
    fireEvent.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent('nicht negativ')
    fireEvent.change(
      screen.getByLabelText('Jahresbetrag Einheit u2 Mieter T2'),
      {
        target: { value: '500' },
      },
    )
    fireEvent.click(save)
    expect(
      onChange.mock.calls
        .at(-1)![0]
        .billingData.prepayments.find(
          ({ id }: { id: string }) => id === 'pp-t2',
        ),
    ).toMatchObject({ mode: 'annual', annualAmountCents: 50000 })

    fireEvent.change(screen.getByLabelText('Modus Einheit u2 Mieter T2'), {
      target: { value: 'none_agreed' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vorauszahlung speichern Einheit u2 Mieter T2',
      }),
    )
    expect(
      onChange.mock.calls
        .at(-1)![0]
        .billingData.prepayments.find(
          ({ id }: { id: string }) => id === 'pp-t2',
        ),
    ).toMatchObject({ mode: 'none_agreed' })
    expect(
      within(rowOf(overviewTable(), 'Einheit u2')).getAllByText('—').length,
    ).toBeGreaterThan(0)
  })

  it('meldet abgelehnte und fehlerhafte Speichervorgänge', () => {
    const data = settledYear()
    const { rerender } = render(
      <PrepaymentsRoute
        data={data}
        billingPeriodId="bp-1"
        onApply={() => false}
      />,
    )
    fireEvent.change(
      screen.getByLabelText('Monatsbetrag Einheit u1 Mieter T1'),
      { target: { value: '60' } },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vorauszahlung speichern Einheit u1 Mieter T1',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Änderung konnte nicht gespeichert werden.',
    )
    rerender(
      <PrepaymentsRoute
        data={data}
        billingPeriodId="bp-1"
        onApply={() => {
          throw 'kaputt'
        }}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vorauszahlung speichern Einheit u1 Mieter T1',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Eingabe konnte nicht verarbeitet werden.',
    )
  })

  it('ist bei gesperrten Jahren nur lesbar', () => {
    const data = withPreviousYear(settledYear())
    const locked: AppDataFile = {
      ...data,
      billingData: {
        ...data.billingData,
        billingPeriods: data.billingData.billingPeriods.map((period) =>
          period.id === 'bp-1' ? { ...period, status: 'IN_REVIEW' } : period,
        ),
        prepayments: data.billingData.prepayments.map((item) =>
          item.id === 'pp-t2'
            ? {
                id: item.id,
                occupancyPeriodId: item.occupancyPeriodId,
                mode: 'annual' as const,
                annualAmountCents: 48000,
              }
            : item,
        ),
      },
    }
    render(<Harness initial={locked} />)
    expect(screen.getByText(/ist gesperrt/u)).toBeVisible()
    const table = overviewTable()
    expect(within(table).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(table).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(table).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(rowOf(table, 'Einheit u1')).getByText('monatlich'),
    ).toBeVisible()
    expect(
      within(rowOf(table, 'Einheit u2')).getAllByText('480,00 € / Jahr'),
    ).toHaveLength(2)
  })

  it('zeigt Hinweise ohne Auswahl, ohne Jahr und ohne Mieter', () => {
    const { rerender } = render(
      <Harness initial={settledYear()} billingPeriodId={null} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte zuerst ein Abrechnungsjahr auswählen.',
    )
    rerender(
      <PrepaymentsRoute
        data={settledYear()}
        billingPeriodId="fehlt"
        onApply={() => true}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('nicht mehr vorhanden')
    const empty = buildAppDataFile(scenarios[0]!)
    rerender(
      <PrepaymentsRoute
        data={{
          ...empty,
          billingData: { ...empty.billingData, occupancyPeriods: [] },
        }}
        billingPeriodId="bp-1"
        onApply={() => true}
      />,
    )
    expect(screen.getByText(/keine Mieter erfasst/u)).toBeVisible()
    expect(screen.getByText(/kein Abrechnungsjahr angelegt/u)).toBeVisible()
    expect(
      screen.getByText(/Noch kein gespeicherter Rechenstand/u),
    ).toBeVisible()
  })

  it('weist im Folgejahr auf eine beschlossene, nicht übernommene Anpassung hin', () => {
    const decided = decidePrepaymentAdjustment(
      settledYear(),
      {
        billingPeriodId: 'bp-1',
        occupancyPeriodId: 'op-t1',
        accepted: true,
        newMonthlyCents: 6000,
        validFrom: '2025-01-01',
      },
      { createId: () => 'audit-x', now: () => new Date() },
    )
    render(<Harness initial={withFollowYear(decided)} billingPeriodId="bp-2" />)
    expect(
      screen.getByText('Beschlossene Anpassung: 60,00 € ab 01.01.2025'),
    ).toBeVisible()
  })
})

describe('PrepaymentsRoute – VZ-Anpassung', () => {
  function adjustmentTable() {
    return screen.getByRole('table', { name: 'VZ-Anpassung' })
  }

  it('zeigt den Vorschlag alt → neu mit Warnung zum Termin', () => {
    render(<Harness initial={withFollowYear()} />)
    // Standard wäre der nächste zulässige 01.01. (2026); hier bewusst früher
    expect(screen.getByLabelText('Neue Vorauszahlung gültig ab')).toHaveValue(
      '2026-01-01',
    )
    fireEvent.change(screen.getByLabelText('Neue Vorauszahlung gültig ab'), {
      target: { value: '2025-01-01' },
    })
    const table = adjustmentTable()
    const row = rowOf(table, 'Einheit u1')
    expect(within(row).getByText('366 Tage')).toBeVisible()
    expect(within(row).getByText('718,03 €')).toBeVisible()
    expect(within(row).getByText('50,00 €')).toBeVisible()
    expect(
      within(row).getByLabelText('Neue Vorauszahlung Einheit u1 Mieter T1'),
    ).toHaveValue('60,00')
    expect(within(row).getByText(/Termin zu früh/u)).toHaveTextContent(
      'frühestens ab 01.05.2025',
    )
    expect(within(row).getByText('Offen')).toBeVisible()
    expect(within(table).queryByText('Einheit u2')).not.toBeInTheDocument()
  })

  it('erklärt, in welches Abrechnungsjahr die neue Vorauszahlung eingetragen wird', () => {
    render(<Harness initial={withFollowYear()} />)
    expect(
      screen.getByText(
        /Bei „Ja“ wird die neue Vorauszahlung im Abrechnungsjahr eingetragen, ab dem sie gilt \(Standard: nächster zulässiger 01\.01\. nach Versand\), und das Anpassungsschreiben an die Einzelabrechnung angehängt\./,
      ),
    ).toBeVisible()
    expect(screen.queryByText(/im Folgejahr eingetragen/)).toBeNull()
  })

  it('speichert „Ja“ ins Folgejahr und „Nein“ als Entscheidung', () => {
    const onChange = vi.fn()
    render(<Harness initial={withFollowYear()} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Neue Vorauszahlung gültig ab'), {
      target: { value: '2025-01-01' },
    })
    fireEvent.change(
      screen.getByLabelText('Neue Vorauszahlung Einheit u1 Mieter T1'),
      {
        target: { value: '62' },
      },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Anpassung ja Einheit u1 Mieter T1' }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'im Abrechnungsjahr 2025 eingetragen',
    )
    let saved: AppDataFile = onChange.mock.calls.at(-1)![0]
    expect(
      saved.billingData.prepayments.find(({ id }) => id === 'pp-t1-2025'),
    ).toMatchObject({ monthlyAmountCents: 6200 })
    expect(
      within(adjustmentTable()).getByText(
        'Ja: 62,00 € ab 01.01.2025 · Anpassungsschreiben wird beigefügt',
      ),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Anpassung nein Einheit u1 Mieter T1',
      }),
    )
    saved = onChange.mock.calls.at(-1)![0]
    expect(
      saved.billingData.prepayments.find(({ id }) => id === 'pp-t1-2025'),
    ).toMatchObject({ monthlyAmountCents: 5000 })
    expect(screen.getByRole('status')).toHaveTextContent('„Nein“ gespeichert')
    expect(
      within(adjustmentTable()).getByText('Nein: keine Anpassung'),
    ).toBeVisible()
  })

  it('prüft Termin und Betrag und meldet gesperrte Folgejahre', () => {
    render(<Harness initial={withFollowYear(settledYear(), 'FINALIZED')} />)
    fireEvent.change(screen.getByLabelText('Neue Vorauszahlung gültig ab'), {
      target: { value: '2025-01-15' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Erste eines Monats nach dem Abrechnungsjahr',
    )
    expect(
      screen.getByRole('button', { name: 'Anpassung ja Einheit u1 Mieter T1' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Neue Vorauszahlung gültig ab'), {
      target: { value: '2025-06-01' },
    })
    expect(screen.queryByText(/Termin zu früh/u)).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByLabelText('Neue Vorauszahlung Einheit u1 Mieter T1'),
      {
        target: { value: 'x' },
      },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Anpassung ja Einheit u1 Mieter T1' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('gültigen Eurobetrag')
    fireEvent.change(
      screen.getByLabelText('Neue Vorauszahlung Einheit u1 Mieter T1'),
      {
        target: { value: '60' },
      },
    )
    fireEvent.change(screen.getByLabelText('Neue Vorauszahlung gültig ab'), {
      target: { value: '2025-01-01' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Anpassung ja Einheit u1 Mieter T1' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Abrechnungsjahr 2025 ist gesperrt',
    )
  })

  it('markiert veraltete Entscheidungen und kurze Belegungen', () => {
    const data = withFollowYear()
    const decided = decidePrepaymentAdjustment(
      data,
      {
        billingPeriodId: 'bp-1',
        occupancyPeriodId: 'op-t1',
        accepted: true,
        newMonthlyCents: 6000,
        validFrom: '2025-01-01',
      },
      { createId: () => 'audit-y', now: () => new Date() },
    )
    const stale: AppDataFile = {
      ...decided,
      billingData: {
        ...decided.billingData,
        auditEvents: decided.billingData.auditEvents.map((event) => ({
          ...event,
          details: { ...event.details, annualizedCostsCents: 1 },
        })),
        billingPeriods: decided.billingData.billingPeriods.map((period) =>
          period.id === 'bp-1'
            ? { ...period, dispatchDate: '2024-11-20' }
            : period,
        ),
      },
    }
    render(<Harness initial={stale} />)
    expect(
      screen.getByText('Rechenstand geändert – bitte neu entscheiden'),
    ).toBeVisible()
    expect(screen.queryByText(/Termin zu früh/u)).not.toBeInTheDocument()
  })

  it('erklärt fehlende Vorschläge und zu alte Rechenstände', () => {
    const data = settledYear()
    const noProposal: AppDataFile = {
      ...data,
      billingData: {
        ...data.billingData,
        prepayments: data.billingData.prepayments.map((item) =>
          item.id === 'pp-t1'
            ? { ...item, mode: 'monthly' as const, monthlyAmountCents: 6000 }
            : item,
        ),
      },
    }
    const { rerender } = render(
      <PrepaymentsRoute
        data={noProposal}
        billingPeriodId="bp-1"
        onApply={() => true}
      />,
    )
    expect(screen.getByText(/keine Anpassung vorzuschlagen/u)).toBeVisible()
    const incompatible: AppDataFile = {
      ...data,
      billingData: {
        ...data.billingData,
        calculationResults: data.billingData.calculationResults.map(
          (result) => ({ ...result, resultSnapshot: {} }),
        ),
      },
    }
    rerender(
      <PrepaymentsRoute
        data={incompatible}
        billingPeriodId="bp-1"
        onApply={() => true}
      />,
    )
    expect(screen.getByText(/Rechenstand ist zu alt/u)).toBeVisible()
  })
})
