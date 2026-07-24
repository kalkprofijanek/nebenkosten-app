import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * `pdfmake`/`jszip` (PR 11) werden im Haupt-Build bewusst per dynamischem
 * `import()` nachgeladen, damit das Haupt-Bundle klein bleibt. Für die
 * Ein-Datei-HTML-Vorschau (`build:html-preview`) gibt es aber keinen
 * Server, der zusätzliche Chunk-Dateien ausliefern könnte — dort wird
 * über diese Umgebungsvariable alles in ein einziges Skript inline gebaut.
 */
const singleChunkPreview =
  process.env.NEBENKOSTEN_SINGLE_CHUNK_PREVIEW === 'true'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: singleChunkPreview
    ? { rollupOptions: { output: { codeSplitting: false } } }
    : undefined,
})
