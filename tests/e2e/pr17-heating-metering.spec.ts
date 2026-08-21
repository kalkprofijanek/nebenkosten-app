import { expect, test, type Page } from '@playwright/test'

async function waitForLocalSave(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Daten importieren' }),
  ).toBeEnabled()
  await expect(page.getByText('Lokal gespeichert')).toBeVisible()
}

test('captures a mixed heating setup, fuel delivery and meter readings', async ({
  page,
}) => {
  test.setTimeout(45_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()
  await waitForLocalSave(page)
  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktive Energieverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await waitForLocalSave(page)

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('HEIZ-01')
  await page.getByLabel('Straße').fill('Energieobjekt Alpha')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Musterstadt')
  await page.getByLabel('Gebäudename').fill('Haus Energie')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('80')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()
  await waitForLocalSave(page)

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
  await waitForLocalSave(page)

  await page.getByRole('link', { name: 'Heizkreise', exact: true }).click()
  await page.getByLabel('Heizsystem').fill('Gas-Zentralheizung')
  await page.getByLabel('Quellenschlüssel').fill('gas-haupt')
  await page.getByLabel('Energiequelle').fill('Erdgas')
  await page.getByLabel('Energieträger').fill('gas')
  await page.getByLabel('Heizwert kWh je Einheit').fill('10,5')
  await page.getByLabel('CO₂-Faktor kg je kWh').fill('0,201')
  await page.getByLabel('Zentrale Warmwasserbereitung').check()
  await page.getByLabel('Warmwasseranteil in Prozent').fill('18')
  await page.getByRole('button', { name: 'Heizkreis anlegen' }).click()
  await waitForLocalSave(page)

  await page.getByLabel('Heizsystem').fill('Wärmepumpe Spitzenlast')
  await page.getByLabel('Quellenschlüssel').fill('wp-zusatz')
  await page.getByLabel('Energiequelle').fill('Wärmepumpenstrom')
  await page.getByLabel('Energieträger').fill('electricity')
  await page.getByLabel('CO₂-Faktor kg je kWh').fill('0,38')
  await page.getByRole('button', { name: 'Heizkreis anlegen' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /bereits ein Heizkreis/u }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Heizkreise (1)' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Erdgas' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Wärmepumpenstrom' }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Brennstoffe' }).click()
  await page
    .getByLabel('Aktive Energiequelle')
    .selectOption({ label: 'Erdgas' })
  await page
    .getByRole('combobox', { name: 'Mengeneinheit', exact: true })
    .selectOption('m3')
  await page.getByLabel('Anfangsbestand Menge').fill('500')
  await page.getByLabel('Anfangsbestand Wert in Euro').fill('600,00')
  await page.getByLabel('Restbestand Menge').fill('120')
  await page.getByRole('button', { name: 'Bestand speichern' }).click()
  await waitForLocalSave(page)
  await page.getByLabel('Lieferdatum').fill('2026-02-15')
  await page
    .getByRole('textbox', { name: 'Liefermenge', exact: true })
    .fill('1000')
  await page
    .getByRole('combobox', { name: 'Liefermengeneinheit', exact: true })
    .selectOption('m3')
  await page.getByLabel('Lieferbetrag in Euro').fill('1250,00')
  await page
    .getByLabel('Beschreibung der Lieferung')
    .fill('Gaslieferung Februar')
  await page.getByRole('button', { name: 'Lieferung hinzufügen' }).click()
  await waitForLocalSave(page)
  await expect(
    page.getByRole('heading', { name: 'Gaslieferung Februar' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Zähler' }).click()
  await page.getByLabel('Zählerart').selectOption('heat')
  await page
    .getByRole('textbox', { name: 'Zählernummer', exact: true })
    .fill('HZ-FIKTIV-2026')
  await page.getByLabel('Versorger').fill('Fiktive Stadtwerke')
  await page.getByLabel('Status der Zählernummer').selectOption('confirmed')
  await page.getByLabel('Gültig von').fill('2026-01-01')
  await page.getByRole('button', { name: 'Zähler anlegen' }).click()
  await waitForLocalSave(page)
  await expect(
    page.getByRole('heading', { name: 'HZ-FIKTIV-2026' }),
  ).toBeVisible()

  await page.getByLabel('Ablesedatum').fill('2026-01-01')
  await page.getByLabel('Zählerstand').fill('-1')
  await page.getByLabel('Ableseeinheit').selectOption('kWh')
  await page.getByRole('button', { name: 'Ablesung erfassen' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /nicht negativ/u }),
  ).toBeVisible()
  await page.getByLabel('Zählerstand').fill('10000')
  await page.getByRole('button', { name: 'Ablesung erfassen' }).click()
  await waitForLocalSave(page)

  await page.getByLabel('Ablesedatum').fill('2026-12-31')
  await page.getByLabel('Zählerstand').fill('18650,5')
  await page.getByLabel('Ableseeinheit').selectOption('kWh')
  await page.getByRole('button', { name: 'Ablesung erfassen' }).click()
  await waitForLocalSave(page)
  await expect(
    page.getByRole('heading', { name: 'Ablesungen (2)' }),
  ).toBeVisible()

  await page.getByLabel('Bankbuchung vorhanden').check()
  await page.getByLabel('Jahresrechnung vorhanden').check()
  await page.getByLabel('Statusnotiz').fill('Jahresrechnung geprüft')
  await page.getByRole('button', { name: 'Jahresstatus speichern' }).click()
  await waitForLocalSave(page)
  await page.reload()
  await page.getByRole('button', { name: 'Zähler' }).click()
  await expect(page.getByLabel('Bankbuchung vorhanden')).toBeChecked()
  await expect(page.getByLabel('Jahresrechnung vorhanden')).toBeChecked()
  await expect(page.getByLabel('Statusnotiz')).toHaveValue(
    'Jahresrechnung geprüft',
  )
})
