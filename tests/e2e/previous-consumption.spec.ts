import { expect, test } from '@playwright/test'
import { consumptionFixture } from '../../apps/web/src/features/consumption/consumption-fixture'

test('pflegt Vorjahreswerte einschließlich null Verbrauch und behält sie nach Neuladen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.goto('/')
  await page.getByLabel('Daten importieren').setInputFiles({
    name: 'fiktive-vorjahreswerte.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(consumptionFixture())),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
  await page.getByRole('link', { name: 'Verbrauch', exact: true }).click()
  const label = 'Wohnung 1 Fiktiv 1'
  await page
    .getByRole('button', { name: `Vorjahresverbrauch bearbeiten ${label}` })
    .click()
  await page
    .getByLabel(`Vorjahresverbrauch ${label}`, { exact: true })
    .fill('0')
  await page.getByLabel(`Jahr Vorjahresverbrauch ${label}`).fill('2024')
  await page
    .getByLabel(`Quelle Vorjahresverbrauch ${label}`)
    .fill('Fiktive Vorjahresabrechnung')
  await page
    .getByRole('button', { name: `Vorjahresverbrauch speichern ${label}` })
    .click()
  await expect(
    page.getByText('Vorjahresverbrauch für Wohnung 1 (Fiktiv 1) gespeichert.'),
  ).toBeVisible()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Verbrauch', exact: true }).click()
  await page
    .getByRole('button', { name: `Vorjahresverbrauch bearbeiten ${label}` })
    .click()
  await expect(
    page.getByLabel(`Vorjahresverbrauch ${label}`, { exact: true }),
  ).toHaveValue('0')
  await expect(page.getByLabel(`Jahr Vorjahresverbrauch ${label}`)).toHaveValue(
    '2024',
  )
  await expect(
    page.getByLabel(`Quelle Vorjahresverbrauch ${label}`),
  ).toHaveValue('Fiktive Vorjahresabrechnung')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false)
})
