import { expect, test } from '@playwright/test'

function releaseReadyData() {
  return {
    schemaVersion: 4,
    meta: { appVersion: 'pr10-e2e' },
    masterData: {
      organizations: [{ id: 'org-1', name: 'Fiktive Verwaltung' }],
      ownerCompanies: [
        {
          id: 'owner-1',
          organizationId: 'org-1',
          name: 'Fiktive Eigentümerin',
          additionalNameLines: [],
          bankAccount: { iban: ['DE89', '370400440532013000'].join('') },
        },
      ],
      properties: [
        {
          id: 'property-1',
          ownerCompanyId: 'owner-1',
          address: {
            street: 'Musterweg',
            postalCodeAndCity: '12345 Beispielstadt',
          },
        },
      ],
      buildings: [
        {
          id: 'building-1',
          propertyId: 'property-1',
          name: 'Haus A',
          mandateRefPrefixes: ['A'],
        },
      ],
      units: [
        {
          id: 'unit-1',
          propertyId: 'property-1',
          buildingId: 'building-1',
          usableAreaSqm: { value: 60, unit: 'm2' },
          heatedAreaSqm: { value: 55, unit: 'm2' },
        },
      ],
      persons: [
        {
          id: 'person-1',
          organizationId: 'org-1',
          displayName: 'Fiktive Testperson',
        },
      ],
      tenancies: [
        {
          id: 'tenancy-1',
          unitId: 'unit-1',
          personIds: ['person-1'],
          shippingAddressStreet: 'Musterweg',
          shippingAddressPostalCodeAndCity: '12345 Beispielstadt',
        },
      ],
      allocationRules: [],
      heatingSystems: [],
      meters: [],
    },
    billingData: {
      billingPeriods: [
        {
          id: 'period-1',
          propertyId: 'property-1',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
      occupancyPeriods: [
        {
          id: 'occupancy-1',
          billingPeriodId: 'period-1',
          unitId: 'unit-1',
          tenancyId: 'tenancy-1',
          kind: 'tenant',
        },
      ],
      prepayments: [
        {
          id: 'prepayment-1',
          occupancyPeriodId: 'occupancy-1',
          mode: 'none_agreed',
        },
      ],
      costCategories: [
        {
          id: 'category-1',
          billingPeriodId: 'period-1',
          kind: 'operating',
          label: 'Fiktive Betriebskosten',
          standardKey: 'fictional',
          allocationKey: 'usable_area',
          totalAmountCents: 10_000,
        },
      ],
      costEntries: [
        {
          id: 'entry-1',
          costCategoryId: 'category-1',
          amountCents: 10_000,
          receiptReference: 'FIKTIV-1',
          externalPayment: {
            confirmed: true,
            reason: 'Fiktiver E2E-Testfall',
          },
        },
      ],
      bankBookings: [],
      heatingCircuits: [],
      energySources: [],
      fuelStocks: [],
      fuelDeliveries: [],
      meterReadings: [],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  }
}

test('moves a valid fictional billing period through review to PDF-ready', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'pr10-fiktiv.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(releaseReadyData())),
  })
  await page.getByRole('button', { name: 'Import übernehmen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByRole('link', { name: 'Berechnung', exact: true }).click()
  await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
  await expect(page.getByText('Erfasste Kosten')).toBeVisible()

  await page.getByRole('link', { name: 'Freigabe', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Prüfung und Freigabe' }),
  ).toBeVisible()
  await expect(page.getByText('Keine Prüfhinweise vorhanden.')).toBeVisible()

  await page.getByRole('button', { name: 'Prüfung starten' }).click()
  await expect(page.getByText('In Prüfung', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Für PDF freigeben' }).click()
  await expect(page.getByText('PDF-bereit', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Finalisieren' }),
  ).toBeDisabled()

  await page.getByLabel('Grund für das Wiederöffnen').fill('Testkorrektur')
  await page.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(page.getByText('In Prüfung', { exact: true })).toBeVisible()
})
