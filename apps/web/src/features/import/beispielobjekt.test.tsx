import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareImport } from './prepare-import'

/** Das fiktive Beispielobjekt (PR-37) lädt über den normalen Importweg. */
describe('Beispielobjekt', () => {
  it('lässt sich über „Daten importieren“ laden', async () => {
    const bytes = readFileSync(
      resolve(process.cwd(), 'docs/beispiel/beispielobjekt.json'),
    )
    const result = await prepareImport(new Uint8Array(bytes), {
      sourceFileName: 'beispielobjekt.json',
      appVersion: 'beispiel-test',
    })
    expect(result).toMatchObject({ ok: true, data: { schemaVersion: 5 } })
  })
})
