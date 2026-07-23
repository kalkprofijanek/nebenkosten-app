import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const webDirectory = resolve(scriptDirectory, '..')
const distributionDirectory = resolve(webDirectory, 'dist')
const outputFile = resolve(
  webDirectory,
  '..',
  '..',
  'private-data',
  'previews',
  'PR10_UI_VORSCHAU.html',
)

const builtHtml = await readFile(
  resolve(distributionDirectory, 'index.html'),
  'utf8',
)
const stylesheetMatch = builtHtml.match(
  /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/,
)
const scriptMatch = builtHtml.match(
  /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/,
)

if (!stylesheetMatch?.[1] || !scriptMatch?.[1]) {
  throw new Error('The Vite output did not contain the expected assets.')
}

const [stylesheet, script] = await Promise.all([
  readFile(resolve(distributionDirectory, stylesheetMatch[1]), 'utf8'),
  readFile(resolve(distributionDirectory, scriptMatch[1]), 'utf8'),
])

const previewNotice = `
  <div class="preview-notice" role="status">
    <strong>Lokale PR-10-Vorschau</strong>
    <span>Diese Zwischenansicht verwendet keine echten Daten. Änderungen bleiben nur bis zum Neuladen erhalten.</span>
  </div>`
const noticeStyles = `
    .preview-notice {
      position: fixed;
      z-index: 200;
      right: 1rem;
      bottom: 1rem;
      display: grid;
      max-width: 24rem;
      gap: .2rem;
      padding: .8rem 1rem;
      border: 1px solid #b7cebf;
      border-radius: .75rem;
      background: #fff;
      color: #143c31;
      box-shadow: 0 1rem 3rem rgb(20 60 49 / 18%);
      font: 12px/1.45 Inter, system-ui, sans-serif;
    }
    .preview-notice span { color: #66736c; }
    @media (max-width: 620px) {
      .preview-notice { right: .75rem; bottom: 5.25rem; left: .75rem; }
    }
  `
const styleContent = `${stylesheet}\n${noticeStyles}`
const scriptContent = script.replaceAll('</script', '<\\\\/script')
const sha256 = (content) =>
  createHash('sha256').update(content).digest('base64')
const contentSecurityPolicy = [
  "default-src 'none'",
  `script-src 'sha256-${sha256(scriptContent)}'`,
  `style-src 'sha256-${sha256(styleContent)}'`,
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const standaloneHtml = builtHtml
  .replace(stylesheetMatch[0], () => `<style>${styleContent}</style>`)
  .replace(
    scriptMatch[0],
    () => `<script type="module">${scriptContent}</script>`,
  )
  .replace(
    '<meta charset="UTF-8" />',
    () =>
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
  )
  .replace(
    '<div id="root"></div>',
    () => `<div id="root"></div>${previewNotice}`,
  )

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, standaloneHtml, 'utf8')

console.log(outputFile)
