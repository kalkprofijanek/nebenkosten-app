#!/usr/bin/env node
/**
 * Erzeugt Screenshots und Musterabrechnungen für README und Handbuch aus dem
 * fiktiven Beispielobjekt (`docs/beispiel/beispielobjekt.json`) und schreibt
 * das Hash-Manifest `docs/medien/SHA256SUMS`, ohne das der Privacy-Scan
 * Binärdateien ablehnt (ADR-0012).
 *
 * Aufruf (nach `pnpm build`): `pnpm medien`
 *
 * Schritte: PDFs über `pnpm abrechnung`, Seite 1 einer Einzelabrechnung als
 * Vorschaubild (braucht `pdftoppm` aus poppler-utils, sonst übersprungen),
 * Screenshots über `tests/e2e/medien.spec.ts`.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MEDIA = 'docs/medien'
const SAMPLES = `${MEDIA}/musterabrechnung-2025`
const EXAMPLE = 'docs/beispiel/beispielobjekt.json'

/** Ausgewählte Fälle: Auszug, Einzug, Wärmepumpe und beide Gesamtfassungen. */
const SELECTION = [
  [
    'Haus_Nord_Whg_3_Familie_Musterfrau',
    'einzelabrechnung-nord-whg3-auszug.pdf',
  ],
  ['Haus_Nord_Whg_3_Lena_Exempel', 'einzelabrechnung-nord-whg3-einzug.pdf'],
  [
    'Haus_Nord_Whg_1_Erika_Mustermann',
    'einzelabrechnung-nord-whg1-oelheizung.pdf',
  ],
  ['Whg_1_Anna_Probe', 'einzelabrechnung-sued-whg1-waermepumpe.pdf'],
  ['Gesamtabrechnung_Mieter', 'gesamtabrechnung-mieter.pdf'],
  ['Gesamtabrechnung_intern', 'gesamtabrechnung-intern.pdf'],
]

const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return result.status ?? 1
}

await mkdir(SAMPLES, { recursive: true })
const work = await mkdtemp(join(tmpdir(), 'nk-medien-'))
try {
  // Die Abrechnung meldet für das Beispiel gewollt „IBAN fehlt“ (Exit 1);
  // maßgeblich ist, dass alle PDFs geschrieben werden.
  run('node', [
    'scripts/abrechnung.mjs',
    EXAMPLE,
    '--jahr',
    '2025',
    '--out',
    work,
  ])
  const written = await readdir(work)
  for (const [fragment, target] of SELECTION) {
    const source = written.find((name) => name.includes(fragment))
    if (!source) throw new Error(`Musterabrechnung fehlt: ${fragment}`)
    await copyFile(join(work, source), join(SAMPLES, target))
  }

  const preview = spawnSync('pdftoppm', [
    '-png',
    '-r',
    '80',
    '-f',
    '1',
    '-l',
    '1',
    '-singlefile',
    join(SAMPLES, 'einzelabrechnung-nord-whg3-auszug.pdf'),
    join(MEDIA, '08-einzelabrechnung-seite-1'),
  ])
  if (preview.status !== 0)
    console.warn('pdftoppm nicht verfügbar – Vorschaubild unverändert.')

  const status = run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'tests/e2e/medien.spec.ts',
      '--reporter=line',
    ],
    { MEDIEN_AKTUALISIEREN: '1' },
  )
  if (status !== 0) throw new Error('Screenshots fehlgeschlagen.')

  const files = execFileSync(
    'git',
    ['ls-files', '--others', '--cached', '--exclude-standard', MEDIA],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((path) => /\.(png|pdf)$/u.test(path))
    .sort()
  const lines = []
  for (const path of files) {
    const hash = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
    lines.push(`${hash}  ${path.slice(MEDIA.length + 1)}`)
  }
  await writeFile(join(MEDIA, 'SHA256SUMS'), `${lines.join('\n')}\n`)
  console.log(`${lines.length} Dateien in ${MEDIA}/SHA256SUMS eingetragen.`)
} finally {
  await rm(work, { recursive: true, force: true })
}
