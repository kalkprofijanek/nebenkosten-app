import type { AppDataFile } from '@nebenkosten/schema'
import { useState } from 'react'
import { MonthlyDispatch } from './MonthlyDispatch'
import { MonthlyOverview } from './MonthlyOverview'
import { previousMonthOf } from './format'
import { MonthlyReadingsImport } from './MonthlyReadingsImport'

type Apply = (transform: (data: AppDataFile) => AppDataFile) => boolean

interface MonthlyInformationRouteProps {
  readonly data: AppDataFile
  readonly propertyId: string | null
  readonly onApply: Apply
  readonly today?: () => Date
  readonly createId?: () => string
}

const defaultToday = () => new Date()
const defaultCreateId = () => globalThis.crypto.randomUUID()

/** Monatliche Verbrauchsinformation nach § 6a HeizKV (ADR-0014). */
export function MonthlyInformationRoute({
  data,
  propertyId,
  onApply,
  today = defaultToday,
  createId = defaultCreateId,
}: MonthlyInformationRouteProps) {
  const [month, setMonth] = useState(() => previousMonthOf(today()))
  if (
    !propertyId ||
    !data.masterData.properties.some(({ id }) => id === propertyId)
  )
    return <p>Bitte zuerst ein Objekt auswählen.</p>
  return (
    <section aria-labelledby="monthly-information-title">
      <div className="data-panel__heading">
        <h2 id="monthly-information-title">Monatliche Verbrauchsinformation</h2>
        <span>Heizung und Warmwasser je Mieter</span>
      </div>
      <p>
        Sind fernablesbare Zähler eingebaut, müssen Mieter nach § 6a HeizKV
        jeden Monat über ihren Verbrauch an Heizung und Warmwasser informiert
        werden – mit Vergleich zum Vormonat, zum Vorjahresmonat und zu einem
        Durchschnittsnutzer. Werte, die nicht erhoben werden konnten, werden als
        „nicht erhoben“ mit Grund ausgewiesen.
      </p>
      <ol aria-label="Ablauf je Monat">
        <li>CSV der Auslesesoftware laden.</li>
        <li>Vorschau prüfen: neue Stände, Dubletten, Probleme.</li>
        <li>Geprüfte Zählerstände übernehmen.</li>
        <li>Monatsübersicht kontrollieren.</li>
        <li>
          PDF je Mieter erzeugen, per E-Mail-Entwurf oder Brief versenden und
          den Versand des Monats protokollieren.
        </li>
      </ol>
      <MonthlyReadingsImport
        key={propertyId}
        data={data}
        propertyId={propertyId}
        onApply={onApply}
        createId={createId}
      />
      <MonthlyOverview
        key={`overview-${propertyId}`}
        data={data}
        propertyId={propertyId}
        month={month}
        onMonthChange={setMonth}
      />
      <MonthlyDispatch
        key={`dispatch-${propertyId}-${month}`}
        data={data}
        propertyId={propertyId}
        month={month}
        onApply={onApply}
        today={today}
        createId={createId}
      />
    </section>
  )
}
