import { expect, test } from '@playwright/test'

test('release shell stays same-origin and enforces its static privacy policy', async ({
  page,
}) => {
  const foreignRequests: string[] = []
  page.on('request', (request) => {
    const requestUrl = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(requestUrl.hostname)) {
      foreignRequests.push(requestUrl.origin)
    }
  })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Abrechnung im Blick' }),
  ).toBeVisible()

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("connect-src 'none'")
  expect(policy).toContain("object-src 'none'")

  await page.getByRole('link', { name: 'Sicherung', exact: true }).click()
  await expect(page).toHaveURL(/#\/sicherung$/u)
  expect(foreignRequests).toEqual([])
})
