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
  // Nach einer zurückgestellten Systemuhr liegen die neuesten automatischen
  // Snapshots in der Zukunft. Das Fenster beginnt dann am neuesten Snapshot,
  // damit diese Wiederherstellungspunkte nicht gelöscht werden.
  const automatic = sorted.filter(
    (snapshot) => !snapshot.pinned && snapshot.kind === 'automatic',
  )
  const newestAutomatic = automatic[0]
    ? Date.parse(automatic[0].createdAt)
    : Number.NEGATIVE_INFINITY
  const anchor = new Date(Math.max(options.now.getTime(), newestAutomatic))
  const recentStart = startOfRecentWindow(anchor)
  const recentAutomatic = automatic.filter(
    (snapshot) => Date.parse(snapshot.createdAt) >= recentStart,
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
