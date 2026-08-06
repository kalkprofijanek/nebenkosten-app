import assert from 'node:assert/strict'
import { test } from 'node:test'

import { replacePreviewContentSecurityPolicy } from '../../apps/web/scripts/preview-csp.mjs'

const productionPolicy = `<meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self'"
    />`

test('replaces the production policy instead of adding a second policy', () => {
  const previewPolicy =
    "default-src 'none'; script-src 'sha256-preview'; style-src 'sha256-preview'"
  const html = `<head>${productionPolicy}</head><body></body>`

  const result = replacePreviewContentSecurityPolicy(html, previewPolicy)

  assert.equal(
    (result.match(/http-equiv="Content-Security-Policy"/g) ?? []).length,
    1,
  )
  assert.match(result, /script-src 'sha256-preview'/)
  assert.doesNotMatch(result, /script-src 'self'/)
})

test('rejects missing or duplicate production policies', () => {
  assert.throws(
    () => replacePreviewContentSecurityPolicy('<head></head>', 'policy'),
    /exactly one Content Security Policy/i,
  )
  assert.throws(
    () =>
      replacePreviewContentSecurityPolicy(
        `<head>${productionPolicy}${productionPolicy}</head>`,
        'policy',
      ),
    /exactly one Content Security Policy/i,
  )
})

test('rejects preview policies that cannot be safely embedded in an HTML attribute', () => {
  assert.throws(
    () =>
      replacePreviewContentSecurityPolicy(
        productionPolicy,
        'script-src "unsafe-inline"',
      ),
    /invalid/i,
  )
  assert.throws(
    () =>
      replacePreviewContentSecurityPolicy(productionPolicy, 'script-src <bad>'),
    /invalid/i,
  )
})
