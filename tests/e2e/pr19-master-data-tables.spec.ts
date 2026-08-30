import { expect, test } from '@playwright/test'

test('bearbeitet Stammdaten und Abrechnungsjahr aus kompakten Tabellen', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktive Tabellenverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Tabellenfirma')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()
  await expect(
    page.getByRole('table', { name: 'Firmenübersicht' }),
  ).toContainText('Fiktive Tabellenfirma')
  await page.getByLabel('Firmen durchsuchen').fill('nicht vorhanden')
  await expect(
    page.getByText('Keine Firma für diese Suche gefunden.'),
  ).toBeVisible()
  await page.getByLabel('Firmen durchsuchen').fill('Tabellenfirma')

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('TAB-01')
  await page.getByLabel('Straße').fill('Fiktives Prüfobjekt Tabellenansicht')
  await page.getByLabel('Gebäudename').fill('Tabellenhaus')
  await page.getByLabel('Erste Einheit').fill('Tabelle 1')
  await page.getByLabel('Nutzfläche in m²').fill('61,5')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()

  await expect(
    page.getByRole('table', { name: 'Objektübersicht' }),
  ).toContainText('61,5 m²')
  await expect(
    page.getByRole('table', { name: 'Gebäudeübersicht' }),
  ).toContainText('Tabellenhaus')
  await expect(
    page.getByRole('table', { name: 'Einheitenübersicht' }),
  ).toContainText('Tabelle 1')
  await expect(page.getByLabel('Gebäudename bearbeiten')).toHaveCount(0)

  await page
    .getByRole('button', { name: 'Gebäude Tabellenhaus bearbeiten' })
    .click()
  await expect(page.getByLabel('Gebäudename bearbeiten')).toBeVisible()
  await page.getByLabel('Gebäudename bearbeiten').press('Escape')
  await expect(page.getByLabel('Gebäudename bearbeiten')).toHaveCount(0)

  await page
    .getByRole('button', { name: 'Einheit Tabelle 1 bearbeiten' })
    .click()
  await page.getByLabel('Lage bearbeiten').fill('1. Obergeschoss')
  await page.getByRole('button', { name: 'Einheit speichern' }).click()
  await expect(
    page.getByRole('table', { name: 'Einheitenübersicht' }),
  ).toContainText('1. Obergeschoss')

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()
  await expect(
    page.getByRole('table', { name: 'Abrechnungsjahre' }),
  ).toContainText('Entwurf')
  await page.getByLabel('Status').selectOption('DRAFT')
  await expect(page.getByRole('status')).toContainText('1 Abrechnungsjahr')
})
