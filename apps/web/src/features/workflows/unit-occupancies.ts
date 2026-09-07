import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
  Unit,
} from '@nebenkosten/schema'

export function unitOccupancies(
  data: AppDataFile,
  period: BillingPeriod,
  units: readonly Unit[],
  occupancies: readonly OccupancyPeriod[],
  search: string,
  filter: string,
) {
  const query = search.trim().toLocaleLowerCase('de-DE')
  return units
    .map((unit) => {
      const timeline = occupancies
        .filter((item) => item.unitId === unit.id)
        .sort(
          (a, b) =>
            (a.from ?? period.periodStart).localeCompare(
              b.from ?? period.periodStart,
            ) ||
            (a.to ?? period.periodEnd).localeCompare(
              b.to ?? period.periodEnd,
            ) ||
            a.id.localeCompare(b.id),
        )
      const building = data.masterData.buildings.find(
        (item) => item.id === unit.buildingId,
      )
      const tenantCount = timeline.filter(
        (item) => item.kind === 'tenant',
      ).length
      const vacancyCount = timeline.length - tenantCount
      const status =
        timeline.length === 0
          ? 'Keine Belegung erfasst'
          : [
              tenantCount
                ? `${tenantCount} Nutzerzeitraum${tenantCount === 1 ? '' : 'e'}`
                : '',
              vacancyCount
                ? `${vacancyCount} Leerstandszeitraum${vacancyCount === 1 ? '' : 'e'}`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')
      return { unit, timeline, building, status }
    })
    .filter(({ unit, timeline, building }) => {
      if (filter === 'empty' && timeline.length !== 0) return false
      if (
        (filter === 'tenant' || filter === 'vacancy') &&
        !timeline.some((item) => item.kind === filter)
      )
        return false
      const personNames = timeline.flatMap((item) => {
        const tenancy = data.masterData.tenancies.find(
          (tenancy) => tenancy.id === item.tenancyId,
        )
        return data.masterData.persons
          .filter((person) => tenancy?.personIds.includes(person.id))
          .flatMap((person) => [
            person.displayName,
            person.firstName,
            person.lastName,
          ])
      })
      return (
        [
          unit.label,
          unit.location,
          building?.name,
          ...timeline.map((item) => item.note),
          ...personNames,
        ].some((value) => value?.toLocaleLowerCase('de-DE').includes(query)) ||
        !query
      )
    })
}
