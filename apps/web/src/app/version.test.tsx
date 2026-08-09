import { describe, expect, it } from 'vitest'

import { APP_RELEASE_LABEL, APP_VERSION } from './version'

describe('release version', () => {
  it('uses the first production version consistently', () => {
    expect(APP_VERSION).toBe('1.0.1')
    expect(APP_RELEASE_LABEL).toBe('Schema v4 · Version 1.0.1')
  })
})
