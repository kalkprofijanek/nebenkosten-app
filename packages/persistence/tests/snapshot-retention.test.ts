import { describe, expect, it } from 'vitest'
import { selectSnapshotsToRetain, type SnapshotMeta } from '../src'

const NOW = new Date('2026-03-20T12:00:00.000Z')

function snapshot(
  id: string,
  createdAt: string,
  overrides: Partial<SnapshotMeta> = {},
): SnapshotMeta {
  return {
    id,
    createdAt,
    sourceRevision: id.padEnd(64, 'a').slice(0, 64),
    schemaVersion: 4,
    sha256: id.padEnd(64, 'b').slice(0, 64),
    byteLength: 100,
    kind: 'automatic',
    pinned: false,
    ...overrides,
  }
}

describe('selectSnapshotsToRetain', () => {
  it('keeps the latest five automatic snapshots even when several share a UTC day', () => {
    const input = [
      snapshot('sixth', '2026-03-20T06:00:00.000Z'),
      snapshot('fifth', '2026-03-20T07:00:00.000Z'),
      snapshot('fourth', '2026-03-20T08:00:00.000Z'),
      snapshot('third', '2026-03-20T09:00:00.000Z'),
      snapshot('second', '2026-03-20T10:00:00.000Z'),
      snapshot('latest', '2026-03-20T11:00:00.000Z'),
    ]

    const retained = selectSnapshotsToRetain(input, { now: NOW })

    expect(retained.map(({ id }) => id)).toEqual([
      'latest',
      'second',
      'third',
      'fourth',
      'fifth',
    ])
  })

  it('then keeps at most the newest automatic snapshot per UTC day in the last 14 days', () => {
    const input = [
      snapshot('day-1-older', '2026-03-19T08:00:00.000Z'),
      snapshot('day-1-newer', '2026-03-19T20:00:00.000Z'),
      snapshot('day-13', '2026-03-07T23:59:59.000Z'),
      snapshot('day-14-expired', '2026-03-06T23:59:59.000Z'),
      ...Array.from({ length: 5 }, (_, index) =>
        snapshot(
          `latest-${index}`,
          `2026-03-20T${String(11 - index).padStart(2, '0')}:00:00.000Z`,
        ),
      ),
    ]

    const retained = selectSnapshotsToRetain(input, { now: NOW })
    const ids = retained.map(({ id }) => id)

    expect(ids).toContain('day-1-newer')
    expect(ids).toContain('day-13')
    expect(ids).not.toContain('day-1-older')
    expect(ids).not.toContain('day-14-expired')
  })

  it('always retains pinned manual and before_restore snapshots regardless of age', () => {
    const input = [
      snapshot('old-manual', '2020-01-01T00:00:00.000Z', {
        kind: 'manual',
        pinned: true,
      }),
      snapshot('old-before-restore', '2020-01-02T00:00:00.000Z', {
        kind: 'before_restore',
        pinned: true,
      }),
      snapshot('old-automatic', '2020-01-03T00:00:00.000Z'),
    ]

    const retained = selectSnapshotsToRetain(input, { now: NOW })

    expect(retained.map(({ id }) => id)).toEqual([
      'old-before-restore',
      'old-manual',
    ])
  })

  it('is deterministic, newest-first, and does not mutate its input', () => {
    const input = [
      snapshot('older', '2026-03-18T10:00:00.000Z'),
      snapshot('newer', '2026-03-19T10:00:00.000Z'),
    ]
    const untouched = structuredClone(input)

    const first = selectSnapshotsToRetain(input, { now: NOW })
    const second = selectSnapshotsToRetain(input, { now: NOW })

    expect(input).toEqual(untouched)
    expect(first).toEqual(second)
    expect(first.map(({ id }) => id)).toEqual(['newer', 'older'])
    expect(first).not.toBe(input)
  })
})
