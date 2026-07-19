import type { SnapshotMeta } from './contracts'

const RECENT_UTC_DAYS = 14
const LATEST_AUTOMATIC_COUNT = 5

function newestFirst(left: SnapshotMeta, right: SnapshotMeta): number {
  const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  return byTime === 0 ? left.id.localeCompare(right.id) : byTime
}

function utcDay(timestamp: string): string {
  return timestamp.slice(0, 10)
}

function startOfRecentWindow(now: Date): number {
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - (RECENT_UTC_DAYS - 1),
  )
}

export function selectSnapshotsToRetain(
  snapshots: readonly SnapshotMeta[],
  options: { readonly now: Date },
): SnapshotMeta[] {
  const sorted = snapshots
    .map((snapshot) => ({ ...snapshot }))
    .sort(newestFirst)
  const retainedIds = new Set(
    sorted.filter((snapshot) => snapshot.pinned).map(({ id }) => id),
  )
  const recentStart = startOfRecentWindow(options.now)
  const recentAutomatic = sorted.filter(
    (snapshot) =>
      !snapshot.pinned &&
      snapshot.kind === 'automatic' &&
      Date.parse(snapshot.createdAt) >= recentStart &&
      Date.parse(snapshot.createdAt) <= options.now.getTime(),
  )

  for (const snapshot of recentAutomatic.slice(0, LATEST_AUTOMATIC_COUNT)) {
    retainedIds.add(snapshot.id)
  }

  const retainedDays = new Set<string>()
  for (const snapshot of recentAutomatic) {
    if (retainedIds.has(snapshot.id)) {
      retainedDays.add(utcDay(snapshot.createdAt))
      continue
    }

    const day = utcDay(snapshot.createdAt)
    if (!retainedDays.has(day)) {
      retainedIds.add(snapshot.id)
      retainedDays.add(day)
    }
  }

  return sorted.filter(({ id }) => retainedIds.has(id))
}
