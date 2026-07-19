const SHA256_HEX = /^[0-9a-f]{64}$/u

export interface RevisionMessage {
  readonly type: 'revision-changed'
  readonly senderTabId: string
  readonly revision: string
}

export interface BroadcastChannelPort {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  postMessage(message: RevisionMessage): void
  close(): void
}

export function createRevisionMessage(
  senderTabId: string,
  revision: string,
): RevisionMessage {
  return {
    type: 'revision-changed',
    senderTabId,
    revision,
  }
}

export function isRevisionMessage(value: unknown): value is RevisionMessage {
  if (typeof value !== 'object' || value === null) return false
  if (Object.keys(value).length !== 3) return false

  const candidate = value as Partial<RevisionMessage>
  return (
    candidate.type === 'revision-changed' &&
    typeof candidate.senderTabId === 'string' &&
    candidate.senderTabId.length > 0 &&
    candidate.senderTabId.length <= 200 &&
    typeof candidate.revision === 'string' &&
    SHA256_HEX.test(candidate.revision)
  )
}

export class TabCoordinator {
  readonly #port: BroadcastChannelPort
  readonly #tabId: string
  readonly #onExternalRevision: (revision: string) => void
  #started = false

  constructor(
    port: BroadcastChannelPort,
    tabId: string,
    onExternalRevision: (revision: string) => void,
  ) {
    this.#port = port
    this.#tabId = tabId
    this.#onExternalRevision = onExternalRevision
  }

  readonly #handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isRevisionMessage(event.data)) return
    if (event.data.senderTabId === this.#tabId) return
    this.#onExternalRevision(event.data.revision)
  }

  start(): void {
    if (this.#started) return
    this.#started = true
    this.#port.addEventListener('message', this.#handleMessage)
  }

  announce(revision: string): void {
    this.#port.postMessage(createRevisionMessage(this.#tabId, revision))
  }

  dispose(): void {
    if (this.#started) {
      this.#port.removeEventListener('message', this.#handleMessage)
      this.#started = false
    }
    this.#port.close()
  }
}
