import { describe, expect, it, vi } from 'vitest'

import {
  createRevisionMessage,
  isRevisionMessage,
  TabCoordinator,
  type BroadcastChannelPort,
} from './tab-coordination'

const REVISION = 'a'.repeat(64)

function createPort() {
  let listener: ((event: MessageEvent<unknown>) => void) | null = null
  const port: BroadcastChannelPort = {
    addEventListener: vi.fn((_type, nextListener) => {
      listener = nextListener
    }),
    close: vi.fn(),
    postMessage: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return {
    emit(data: unknown) {
      listener?.(new MessageEvent('message', { data }))
    },
    port,
  }
}

describe('tab coordination', () => {
  it('creates a minimal revision-only message', () => {
    expect(createRevisionMessage('tab-a', REVISION)).toEqual({
      type: 'revision-changed',
      senderTabId: 'tab-a',
      revision: REVISION,
    })
  })

  it('accepts only strict, sanitized messages', () => {
    expect(
      isRevisionMessage({
        type: 'revision-changed',
        senderTabId: 'tab-a',
        revision: REVISION,
      }),
    ).toBe(true)
    expect(
      isRevisionMessage({
        type: 'revision-changed',
        senderTabId: 'tab-a',
        revision: REVISION,
        data: { private: true },
      }),
    ).toBe(false)
    expect(
      isRevisionMessage({
        type: 'revision-changed',
        senderTabId: '',
        revision: 'not-a-hash',
      }),
    ).toBe(false)
  })

  it('notifies only for valid revisions from another tab', () => {
    const { emit, port } = createPort()
    const onExternalRevision = vi.fn()
    const coordinator = new TabCoordinator(port, 'tab-a', onExternalRevision)

    coordinator.start()
    emit(createRevisionMessage('tab-a', REVISION))
    emit({ type: 'revision-changed', senderTabId: 'tab-b', revision: 'bad' })
    emit(createRevisionMessage('tab-b', REVISION))

    expect(onExternalRevision).toHaveBeenCalledOnce()
    expect(onExternalRevision).toHaveBeenCalledWith(REVISION)
    coordinator.dispose()
    expect(port.close).toHaveBeenCalledOnce()
  })

  it('broadcasts no domain data', () => {
    const { port } = createPort()
    const coordinator = new TabCoordinator(port, 'tab-a', vi.fn())

    coordinator.announce(REVISION)

    expect(port.postMessage).toHaveBeenCalledWith(
      createRevisionMessage('tab-a', REVISION),
    )
  })
})
