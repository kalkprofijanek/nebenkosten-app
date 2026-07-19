const encoder = new TextEncoder()

export type FakePermissionState = 'denied' | 'granted' | 'prompt'

export interface FakeFailureOptions {
  readonly close?: Error
  readonly createWritable?: Error
  readonly getFile?: Error
  readonly queryPermission?: Error
  readonly requestPermission?: Error
  readonly write?: Error
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (typeof value === 'string') return encoder.encode(value)
  if (value instanceof Uint8Array) return copyBytes(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'write' &&
    'data' in value
  ) {
    return toBytes(value.data)
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function'
  ) {
    return new Uint8Array(await value.arrayBuffer())
  }
  throw new TypeError('Unsupported fake write payload')
}

export class FakeJsonFilePort {
  readCalls = 0
  writeCalls = 0
  readFailure?: Error
  writeFailure?: Error
  tamperAfterWrite?: Uint8Array
  #bytes: Uint8Array | null

  constructor(initialBytes: Uint8Array | null = null) {
    this.#bytes = initialBytes === null ? null : copyBytes(initialBytes)
  }

  async read(): Promise<Uint8Array | null> {
    this.readCalls += 1
    if (this.readFailure) throw this.readFailure
    return this.#bytes === null ? null : copyBytes(this.#bytes)
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.writeCalls += 1
    if (this.writeFailure) throw this.writeFailure
    this.#bytes = copyBytes(bytes)
    if (this.tamperAfterWrite) this.#bytes = copyBytes(this.tamperAfterWrite)
  }

  bytes(): Uint8Array | null {
    return this.#bytes === null ? null : copyBytes(this.#bytes)
  }

  replaceBytes(bytes: Uint8Array | null): void {
    this.#bytes = bytes === null ? null : copyBytes(bytes)
  }
}

export class FakeFileSystemHandle {
  readonly kind = 'file'
  readonly name: string
  closeCalls = 0
  createWritableCalls = 0
  getFileCalls = 0
  queryPermissionCalls = 0
  requestPermissionCalls = 0
  writeCalls = 0
  failures: FakeFailureOptions = {}
  permission: FakePermissionState
  requestedPermission: FakePermissionState
  tamperAfterClose?: Uint8Array
  #bytes: Uint8Array
  #pendingBytes?: Uint8Array

  constructor(
    initialBytes: Uint8Array = new Uint8Array(),
    options: {
      readonly name?: string
      readonly permission?: FakePermissionState
      readonly requestedPermission?: FakePermissionState
    } = {},
  ) {
    this.#bytes = copyBytes(initialBytes)
    this.name = options.name ?? 'fictional-backup.json'
    this.permission = options.permission ?? 'granted'
    this.requestedPermission = options.requestedPermission ?? this.permission
  }

  async getFile(): Promise<{
    readonly name: string
    readonly size: number
    arrayBuffer(): Promise<ArrayBuffer>
  }> {
    this.getFileCalls += 1
    if (this.failures.getFile) throw this.failures.getFile
    const snapshot = copyBytes(this.#bytes)
    return {
      name: this.name,
      size: snapshot.byteLength,
      async arrayBuffer() {
        const result = new Uint8Array(snapshot.byteLength)
        result.set(snapshot)
        return result.buffer
      },
    }
  }

  async queryPermission(): Promise<FakePermissionState> {
    this.queryPermissionCalls += 1
    if (this.failures.queryPermission) throw this.failures.queryPermission
    return this.permission
  }

  async requestPermission(): Promise<FakePermissionState> {
    this.requestPermissionCalls += 1
    if (this.failures.requestPermission) throw this.failures.requestPermission
    this.permission = this.requestedPermission
    return this.permission
  }

  async createWritable(): Promise<{
    abort(): Promise<void>
    close(): Promise<void>
    write(value: unknown): Promise<void>
  }> {
    this.createWritableCalls += 1
    if (this.failures.createWritable) throw this.failures.createWritable
    this.#pendingBytes = copyBytes(this.#bytes)
    return {
      abort: async () => {
        this.#pendingBytes = undefined
      },
      close: async () => {
        this.closeCalls += 1
        if (this.failures.close) throw this.failures.close
        if (this.#pendingBytes) this.#bytes = this.#pendingBytes
        this.#pendingBytes = undefined
        if (this.tamperAfterClose)
          this.#bytes = copyBytes(this.tamperAfterClose)
      },
      write: async (value: unknown) => {
        this.writeCalls += 1
        if (this.failures.write) throw this.failures.write
        this.#pendingBytes = await toBytes(value)
      },
    }
  }

  bytes(): Uint8Array {
    return copyBytes(this.#bytes)
  }

  replaceBytes(bytes: Uint8Array): void {
    this.#bytes = copyBytes(bytes)
  }
}
