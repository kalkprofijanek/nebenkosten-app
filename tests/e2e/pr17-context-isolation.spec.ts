import { expect, test, type Page } from '@playwright/test'

async function createCompany(page: Page) {
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktive Mehrhausverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
}

async function createProperty(
  page: Page,
  internalNumber: string,
  street: string,
) {
  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page
    .getByLabel('Interne Objektnummer', { exact: true })
    .fill(internalNumber)
  await page.getByLabel('Straße', { exact: true }).fill(street)
  await page
    .getByLabel('Postleitzahl und Ort', { exact: true })
    .fill('00000 Musterstadt')
  await page
    .getByLabel('Gebäudename', { exact: true })
    .fill(`Haus ${internalNumber}`)
  await page.getByLabel('Erste Einheit', { exact: true }).fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²', { exact: true }).fill('60')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()
}

async function createBillingYear(page: Page, year: string) {
  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill(year)
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
}

async function createCostCategory(page: Page, label: string) {
  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page.getByLabel('Neue Kostenart').fill(label)
  await page.getByRole('button', { name: 'Kostenart anlegen' }).click()
  await expect(page.getByRole('heading', { name: label })).toBeVisible()
}

test('isolates costs when switching between properties and billing years', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()
  await createCompany(page)

  await createProperty(page, 'OBJ-A', 'Objekt Alpha')
  await createBillingYear(page, '2025')
  await createCostCategory(page, 'Grundsteuer 2025 Objekt A')
  await createBillingYear(page, '2026')
  await createCostCategory(page, 'Grundsteuer 2026 Objekt A')

  await createProperty(page, 'OBJ-B', 'Objekt Beta')
  await createBillingYear(page, '2026')
  await createCostCategory(page, 'Versicherung 2026 Objekt B')

  await page
    .getByLabel('Objekt im Arbeitskontext')
    .selectOption({ label: 'Objekt Alpha · OBJ-A' })
  await page
    .getByLabel('Zeitraum im Arbeitskontext')
    .selectOption({ label: '2026' })
  await expect(
    page.getByRole('heading', { name: 'Grundsteuer 2026 Objekt A' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Versicherung 2026 Objekt B' }),
  ).toHaveCount(0)

  await page
    .getByLabel('Zeitraum im Arbeitskontext')
    .selectOption({ label: '2025' })
  await expect(
    page.getByRole('heading', { name: 'Grundsteuer 2025 Objekt A' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Grundsteuer 2026 Objekt A' }),
  ).toHaveCount(0)

  await page
    .getByLabel('Objekt im Arbeitskontext')
    .selectOption({ label: 'Objekt Beta · OBJ-B' })
  await page
    .getByLabel('Zeitraum im Arbeitskontext')
    .selectOption({ label: '2026' })
  await expect(
    page.getByRole('heading', { name: 'Versicherung 2026 Objekt B' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: /Objekt A/ })).toHaveCount(0)
})
