import { describe, expect, it } from 'vitest'

const workspacePackages = [
  '@nebenkosten/core',
  '@nebenkosten/schema',
  '@nebenkosten/validators',
  '@nebenkosten/persistence',
  '@nebenkosten/import-export',
  '@nebenkosten/pdf',
  '@nebenkosten/ui',
  '@nebenkosten/test-fixtures',
] as const

/**
 * Packages mit echter Implementierung (kein leerer Platzhalter mehr).
 * Muss synchron zu `implementedPackages` in
 * `tests/architecture/workspace-scaffold.test.mjs` gepflegt werden
 * (PR 03: schema; PR 04: import-export).
 */
const implementedPackages = new Set<string>([
  '@nebenkosten/schema',
  '@nebenkosten/import-export',
])

describe('workspace package resolution', () => {
  it.each(workspacePackages)(
    'resolves the workspace package %s',
    async (packageName) => {
      const packageModule = await import(packageName)
      if (implementedPackages.has(packageName)) {
        expect(Object.keys(packageModule).length).toBeGreaterThan(0)
      } else {
        expect(Object.keys(packageModule)).toEqual([])
      }
    },
  )
})
