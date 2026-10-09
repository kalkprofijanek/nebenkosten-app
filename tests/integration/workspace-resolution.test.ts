import { describe, expect, it } from 'vitest'

const workspacePackages = [
  '@nebenkosten/core',
  '@nebenkosten/schema',
  '@nebenkosten/validators',
  '@nebenkosten/persistence',
  '@nebenkosten/import-export',
  '@nebenkosten/pdf',
] as const

describe('workspace package resolution', () => {
  it.each(workspacePackages)(
    'resolves the workspace package %s',
    async (packageName) => {
      const packageModule = await import(packageName)
      expect(Object.keys(packageModule).length).toBeGreaterThan(0)
    },
  )
})
