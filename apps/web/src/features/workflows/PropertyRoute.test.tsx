import {
  createEmptyAppDataFile,
  propertySchema,
  type AppDataFile,
  type RemoteReading,
} from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompany, createPropertyStructure } from '../master-data/commands'
import { PropertyRoute } from './PropertyRoute'

afterEach(cleanup)

const IDS = {
  organization: '30000000-0000-4000-8000-000000000001',
  company: '30000000-0000-4000-8000-000000000002',
  property: '30000000-0000-4000-8000-000000000003',
  building: '30000000-0000-4000-8000-000000000004',
  unit: '30000000-0000-4000-8000-000000000005',
} as const

const SINCE_LABEL = 'Erfassungsgeräte fernablesbar seit'
const REASON_LABEL = 'Ausnahme von der Fernablesbarkeit (Begründung)'

function sequence(values: readonly string[]) {
  const queue = [...values]
  return () => queue.shift()!
}

function fixture(remoteReading?: RemoteReading): AppDataFile {
  let data = createCompany(
    createEmptyAppDataFile(),
    { organizationName: 'Fiktivverwaltung', ownerCompanyName: 'Fiktiv GmbH' },
    { createId: sequence([IDS.organization, IDS.company]) },
  )
  data = createPropertyStructure(
    data,
    {
      ownerCompanyId: IDS.company,
      internalNumber: 'OBJ-FIKTIV',
      buildingName: 'Haus Fiktiv',
      unitLabel: 'Wohnung 1',
      usableAreaSqm: 50,
    },
    { createId: sequence([IDS.property, IDS.building, IDS.unit]) },
  )
  if (remoteReading === undefined) return data
  return {
    ...data,
    masterData: {
      ...data.masterData,
      properties: data.masterData.properties.map((property) => ({
        ...property,
        remoteReading,
      })),
    },
  }
}

function show(initial: AppDataFile) {
  let data = initial
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    data = transform(data)
    return true
  })
  render(
    <PropertyRoute
      data={data}
      selection={{
        ownerCompanyId: IDS.company,
        propertyId: IDS.property,
        billingPeriodId: null,
      }}
      onApply={onApply}
      onSelectionChange={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Objekt bearbeiten' }))
  return {
    onApply,
    property: () => data.masterData.properties[0]!,
    save: () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Objektdaten speichern' }),
      ),
  }
}

describe('PropertyRoute – Fernablesbarkeit (§ 5 HeizKV)', () => {
  it('zeigt beide Felder mit Hilfetext und ohne Vorbelegung', () => {
    show(fixture())
    const since = screen.getByLabelText(SINCE_LABEL)
    const reason = screen.getByLabelText(REASON_LABEL)
    expect(since).toHaveAttribute('type', 'date')
    expect(since).toHaveValue('')
    expect(reason).toHaveValue('')
    expect(since).toHaveAccessibleDescription(
      /per Funk ablesbar sind \(§ 5 HeizKV\)\. Ab diesem Datum sind monatliche Verbrauchsinformationen nötig\./u,
    )
    expect(reason).toHaveAccessibleDescription(
      /unbilliger Härte \(§ 5 Abs\. 3 Satz 2 HeizKV\); muss belegbar sein\./u,
    )
  })

  it('speichert das Datum ohne Begründung', () => {
    const route = show(fixture())
    fireEvent.change(screen.getByLabelText(SINCE_LABEL), {
      target: { value: '2026-03-01' },
    })
    route.save()
    expect(route.onApply).toHaveBeenCalledTimes(1)
    expect(route.property().remoteReading).toEqual({ since: '2026-03-01' })
    expect(propertySchema.safeParse(route.property()).success).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Objektdaten speichern' }),
    ).not.toBeInTheDocument()
  })

  it('speichert eine getrimmte Begründung ohne Datum', () => {
    const route = show(fixture())
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: '  Fiktiv: Funkmodul technisch nicht nachrüstbar  ' },
    })
    route.save()
    expect(route.property().remoteReading).toEqual({
      exemptionReason: 'Fiktiv: Funkmodul technisch nicht nachrüstbar',
    })
    expect(propertySchema.safeParse(route.property()).success).toBe(true)
  })

  it('belegt vorhandene Werte vor und entfernt remoteReading beim Leeren beider Felder', () => {
    const route = show(
      fixture({
        since: '2025-01-01',
        exemptionReason: 'Fiktive Härtefallbegründung',
      }),
    )
    const since = screen.getByLabelText(SINCE_LABEL)
    const reason = screen.getByLabelText(REASON_LABEL)
    expect(since).toHaveValue('2025-01-01')
    expect(reason).toHaveValue('Fiktive Härtefallbegründung')
    fireEvent.change(since, { target: { value: '' } })
    fireEvent.change(reason, { target: { value: '   ' } })
    route.save()
    expect(route.property()).not.toHaveProperty('remoteReading')
    expect(route.property().internalNumber).toBe('OBJ-FIKTIV')
  })

  it('übernimmt unveränderte Werte und lässt ein geleertes Einzelfeld weg', () => {
    const route = show(
      fixture({ since: '2025-01-01', exemptionReason: 'Fiktiver Grund' }),
    )
    fireEvent.change(screen.getByLabelText(REASON_LABEL), {
      target: { value: '' },
    })
    route.save()
    expect(route.property().remoteReading).toEqual({ since: '2025-01-01' })
  })

  it('lehnt ein ungültiges Datum mit Fehlermeldung ab', () => {
    const route = show(fixture())
    // jsdom verwirft ungültige Werte in Datumsfeldern. Ein vorangestelltes
    // Textfeld gleichen Namens liefert den Rohwert, wie ihn Browser ohne
    // Datumsauswahl übermitteln.
    const since = screen.getByLabelText(SINCE_LABEL)
    const raw = document.createElement('input')
    raw.name = 'remoteReadingSince'
    raw.value = '2026-02-30'
    since.closest('form')!.prepend(raw)
    route.save()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte ein gültiges Datum für „Erfassungsgeräte fernablesbar seit“ eingeben.',
    )
    expect(route.property()).not.toHaveProperty('remoteReading')
    expect(
      screen.getByRole('button', { name: 'Objektdaten speichern' }),
    ).toBeInTheDocument()
  })
})
