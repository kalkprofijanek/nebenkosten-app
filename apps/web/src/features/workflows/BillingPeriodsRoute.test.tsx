import {
  createEmptyAppDataFile,
  type AppDataFile,
  type ClimateFactor,
} from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BillingPeriodsRoute } from './BillingPeriodsRoute'

afterEach(cleanup)

const IDS = {
  organization: '40000000-0000-4000-8000-000000000001',
  company: '40000000-0000-4000-8000-000000000002',
  property: '40000000-0000-4000-8000-000000000003',
  period: '40000000-0000-4000-8000-000000000004',
} as const

const SOURCE = 'Deutscher Wetterdienst, Klimafaktoren (Referenz Potsdam)'

// Erfundene Zeilen im Format der DWD-Liste, keine Originalwerte.
const DWD_CSV = [
  'DatAnf;DatEnd;PLZ;KF',
  '20250101;20251231;1234;1.08',
  '20250101;20251231;54321;0.97',
].join('\n')

function createData(climateFactor?: ClimateFactor): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Testverwaltung' }],
      ownerCompanies: [
        {
          id: IDS.company,
          organizationId: IDS.organization,
          name: 'Testgesellschaft',
          additionalNameLines: [],
        },
      ],
      properties: [
        {
          id: IDS.property,
          ownerCompanyId: IDS.company,
          address: { street: 'Test', postalCodeAndCity: '01234 Teststadt' },
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
          ...(climateFactor ? { climateFactor } : {}),
        },
      ],
    },
  }
}

function renderRoute(initial: AppDataFile) {
  let data = initial
  const onApply = vi.fn(
    (transform: (current: AppDataFile) => AppDataFile): boolean => {
      data = transform(data)
      return true
    },
  )
  render(
    <BillingPeriodsRoute
      data={data}
      selection={{
        ownerCompanyId: IDS.company,
        propertyId: IDS.property,
        billingPeriodId: IDS.period,
      }}
      onSelectionChange={vi.fn()}
      onApply={onApply}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
  )
  const form = within(
    screen
      .getByRole('button', { name: 'Änderungen speichern' })
      .closest('form')!,
  )
  return {
    form,
    onApply,
    climateFactor: () => data.billingData.billingPeriods[0]?.climateFactor,
  }
}

function chooseFile(form: ReturnType<typeof within>, content: string) {
  const file = new File([content], 'KF_20250101_20251231.csv', {
    type: 'text/csv',
  })
  fireEvent.change(form.getByLabelText('DWD-Datei (KF_…csv) wählen'), {
    target: { files: [file] },
  })
}

describe('Klimafaktor (DWD) am Abrechnungsjahr', () => {
  it('übernimmt Faktor und Zeitraum aus der DWD-Datei für die Objekt-Postleitzahl', async () => {
    const route = renderRoute(createData())
    expect(route.form.getByText(/Kein Klimafaktor erfasst/)).toBeVisible()
    chooseFile(route.form, DWD_CSV)
    expect(await route.form.findByRole('status')).toHaveTextContent(
      'Klimafaktor 1,08 für Postleitzahl 01234',
    )
    expect(route.form.getByLabelText('Postleitzahl')).toHaveValue('01234')
    expect(route.form.getByLabelText('Klimafaktor')).toHaveValue('1,08')
    expect(route.form.getByLabelText('Faktor-Zeitraum von')).toHaveValue(
      '2025-01-01',
    )
    expect(route.form.getByLabelText('Quelle des Klimafaktors')).toHaveValue(
      SOURCE,
    )
    fireEvent.click(
      route.form.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(route.climateFactor()).toEqual({
      postalCode: '01234',
      factor: 1.08,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      source: SOURCE,
    })
  })

  it('meldet fehlende Postleitzahlen und übernimmt nach Änderung der Postleitzahl', async () => {
    const route = renderRoute(createData())
    fireEvent.click(
      route.form.getByRole('button', { name: 'Klimafaktor von Hand erfassen' }),
    )
    fireEvent.change(route.form.getByLabelText('Postleitzahl'), {
      target: { value: '99999' },
    })
    chooseFile(route.form, DWD_CSV)
    expect(await route.form.findByRole('alert')).toHaveTextContent(
      'Die Postleitzahl 99999 ist in der DWD-Datei nicht enthalten.',
    )
    fireEvent.change(route.form.getByLabelText('Postleitzahl'), {
      target: { value: '54321' },
    })
    expect(route.form.getByLabelText('Klimafaktor')).toHaveValue('0,97')
    expect(
      route.form.getByText(/Objektanschrift nennt die Postleitzahl 01234/),
    ).toBeVisible()
  })

  it('zeigt Fehler einer ungültigen DWD-Datei', async () => {
    const route = renderRoute(createData())
    chooseFile(route.form, 'PLZ;Faktor\n1234;1.0')
    expect(await route.form.findByRole('alert')).toHaveTextContent(
      'Unbekannte Kopfzeile',
    )
    expect(route.form.queryByLabelText('Klimafaktor')).toBeNull()
  })

  it('erfasst den Faktor von Hand mit deutschen Feldfehlern', () => {
    const route = renderRoute(createData())
    fireEvent.click(
      route.form.getByRole('button', { name: 'Klimafaktor von Hand erfassen' }),
    )
    expect(route.form.getByLabelText('Postleitzahl')).toHaveValue('01234')
    fireEvent.change(route.form.getByLabelText('Klimafaktor'), {
      target: { value: 'x' },
    })
    fireEvent.click(
      route.form.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(route.onApply).not.toHaveBeenCalled()
    expect(route.form.getByText(/Klimafaktor als positive Zahl/)).toBeVisible()
    expect(route.form.getByText(/Beginn des Zeitraums/)).toBeVisible()
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Angaben zum Klimafaktor',
    )

    fireEvent.change(route.form.getByLabelText('Klimafaktor'), {
      target: { value: '1,1' },
    })
    fireEvent.change(route.form.getByLabelText('Faktor-Zeitraum von'), {
      target: { value: '2024-12-01' },
    })
    fireEvent.change(route.form.getByLabelText('Faktor-Zeitraum bis'), {
      target: { value: '2025-11-30' },
    })
    expect(route.form.getByText(/weicht vom Abrechnungszeitraum/)).toBeVisible()
    fireEvent.click(
      route.form.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(route.climateFactor()).toMatchObject({
      postalCode: '01234',
      factor: 1.1,
      periodStart: '2024-12-01',
    })
  })

  it('zeigt einen vorhandenen Faktor und entfernt ihn', () => {
    const route = renderRoute(
      createData({
        postalCode: '01234',
        factor: 0.9,
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        source: SOURCE,
      }),
    )
    expect(route.form.getByLabelText('Klimafaktor')).toHaveValue('0,9')
    fireEvent.click(
      route.form.getByRole('button', { name: 'Klimafaktor entfernen' }),
    )
    fireEvent.click(
      route.form.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(route.onApply).toHaveBeenCalledTimes(1)
    expect(route.climateFactor()).toBeUndefined()
  })
})
