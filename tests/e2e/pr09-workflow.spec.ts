import { expect, test } from '@playwright/test'

test('completes the PR09 workflow from workspace to locked release', async ({
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
  await page.getByLabel('Kostenart').fill('Sachversicherung')
  await page.getByLabel('Betrag in Euro').fill('120,00')
  await page.getByRole('button', { name: 'Kosten erfassen' }).click()
  await expect(page.getByText('Sachversicherung')).toBeVisible()

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
      name: 'Freigabe bleibt bis PR 10 gesperrt',
    }),
  ).toBeVisible()
})
