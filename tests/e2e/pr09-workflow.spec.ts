import { expect, test } from '@playwright/test'

test('completes the workflow from workspace to the PR10 review gate', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Musterverwaltung')
  await page.getByLabel('Firmenname').fill('Muster Eigentum')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(page.getByText('Muster Eigentum').last()).toBeVisible()

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('TEST-01')
  await page.getByLabel('Straße').fill('Fiktive Straße')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Beispielstadt')
  await page.getByLabel('Gebäudename').fill('Haus A')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('72,5')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()
  await expect(page.getByText('TEST-01').last()).toBeVisible()

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
  await expect(page.getByText('2026').last()).toBeVisible()

  await page.getByRole('link', { name: 'Nutzer', exact: true }).click()
  await page.getByLabel('Anzeigename').fill('Testnutzer')
  await page.getByLabel('Personenzahl').fill('1')
  await page.getByLabel('Vorauszahlung in Euro').fill('100,00')
  await page.getByRole('button', { name: 'Nutzer anlegen' }).click()
  await expect(page.getByText('Testnutzer')).toBeVisible()

  await page.getByRole('link', { name: 'Kosten', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Neue Kostenart', exact: true })
    .fill('Sachversicherung')
  await page.getByRole('button', { name: 'Kostenart anlegen' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Kostenarten (1)' })
      .getByText('Sachversicherung'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Kostenpositionen' }).click()
  await page.getByLabel('Beschreibung').fill('Sachversicherung 2026')
  await page.getByLabel('Betrag in Euro').fill('120,00')
  await page.getByRole('button', { name: 'Kostenposition anlegen' }).click()
  await expect(
    page.getByRole('heading', { name: 'Kostenpositionen (1)' }),
  ).toBeVisible()
  await expect(page.getByText('Sachversicherung 2026')).toBeVisible()

  await page.getByRole('link', { name: 'Heizkreise', exact: true }).click()
  await page.getByLabel('Heizsystem').fill('Zentralheizung')
  await page.getByLabel('Quellenschlüssel').fill('haupt')
  await page.getByLabel('Energiequelle').fill('Gas')
  await page.getByLabel('Energieträger').fill('Erdgas')
  await page.getByRole('button', { name: 'Heizkreis anlegen' }).click()
  await expect(page.getByText('Gas')).toBeVisible()

  await page.getByRole('link', { name: 'Berechnung', exact: true }).click()
  await page.getByRole('button', { name: 'Abrechnung berechnen' }).click()
  await expect(page.getByText('Erfasste Kosten')).toBeVisible()

  await page.getByRole('link', { name: 'Freigabe', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Prüfung und Freigabe',
    }),
  ).toBeVisible()
  await expect(page.getByText(/IBAN fehlt/)).toBeVisible()

  await page.getByRole('button', { name: 'Prüfung starten' }).click()
  await expect(page.getByText('In Prüfung', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Für PDF freigeben' }),
  ).toBeDisabled()
})
