import { describe, expect, it } from 'vitest'

describe('migration scaffold', () => {
  it('keeps the schema package API-neutral until PR 03', async () => {
    const schemaModule = await import('@nebenkosten/schema')
    expect(Object.keys(schemaModule)).toEqual([])
  })
})
