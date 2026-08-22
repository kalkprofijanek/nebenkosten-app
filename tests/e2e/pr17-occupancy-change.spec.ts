import { expect, test } from '@playwright/test'

test('handles a tenant change, vacancy and overlap correction', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Arbeitsbestand anlegen' }).click()

  await page.getByRole('link', { name: 'Firmen', exact: true }).click()
  await page.getByLabel('Mandantenname').fill('Fiktive Wechselverwaltung')
  await page.getByLabel('Firmenname').fill('Fiktive Eigentümerin')
  await page.getByRole('button', { name: 'Firma anlegen' }).click()

  await page.getByRole('link', { name: 'Objekte', exact: true }).click()
  await page.getByLabel('Interne Objektnummer').fill('WECHSEL-01')
  await page.getByLabel('Straße').fill('Wechselobjekt Alpha')
  await page.getByLabel('Postleitzahl und Ort').fill('00000 Musterstadt')
  await page.getByLabel('Gebäudename').fill('Haus Wechsel')
  await page.getByLabel('Erste Einheit').fill('Wohnung 1')
  await page.getByLabel('Nutzfläche in m²').fill('65')
  await page.getByRole('button', { name: 'Objekt anlegen' }).click()

  await page
    .getByRole('link', { name: 'Abrechnungsjahre', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Abrechnungsjahr' }).fill('2026')
  await page.getByRole('button', { name: 'Abrechnungsjahr anlegen' }).click()

  await page.getByRole('link', { name: 'Nutzer', exact: true }).click()
  await page.getByLabel('Anzeigename').fill('Anna Alt')
  await page.getByLabel('Einzug').fill('2026-01-01')
  await page.getByLabel('Auszug').fill('2026-06-30')
  await page.getByLabel('Personenzahl').fill('1')
  await page.getByLabel('Vorauszahlung in Euro').fill('180,00')
  await page.getByRole('button', { name: 'Nutzer anlegen' }).click()

  await page.getByLabel('Leerstand von').fill('2026-07-01')
  await page.getByLabel('Leerstand bis').fill('2026-08-31')
  await page.getByLabel('Leerstandsnotiz').fill('Renovierung nach Auszug')
  await page.getByRole('button', { name: 'Leerstand anlegen' }).click()

  await page.getByLabel('Anzeigename').fill('Berta Neu')
  await page.getByLabel('Einzug').fill('2026-09-01')
  await page.getByLabel('Auszug').fill('2026-12-31')
  await page.getByLabel('Personenzahl').fill('2')
  await page.getByLabel('Vorauszahlung in Euro').fill('210,00')
  await page.getByRole('button', { name: 'Nutzer anlegen' }).click()

  await expect(
    page.getByRole('heading', { name: 'Nutzer und Leerstände (3)' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Anna Alt' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Leerstand', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Berta Neu' })).toBeVisible()

  await page.getByLabel('Leerstand von').fill('2026-06-15')
  await page.getByLabel('Leerstand bis').fill('2026-07-15')
  await page.getByRole('button', { name: 'Leerstand anlegen' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /überschneidet/u }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Nutzer und Leerstände (3)' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Anna Alt bearbeiten' }).click()
  await page.getByLabel('Auszug bearbeiten').fill('2026-09-15')
  await page.getByRole('button', { name: 'Nutzerdaten speichern' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /überschneidet/u }),
  ).toBeVisible()
  await page.getByLabel('Auszug bearbeiten').fill('2026-06-30')
  await page.getByLabel('Nutzernotiz bearbeiten').fill('Auszug bestätigt')
  await page.getByRole('button', { name: 'Nutzerdaten speichern' }).click()
  await page.getByRole('button', { name: 'Anna Alt bearbeiten' }).click()
  await expect(page.getByLabel('Nutzernotiz bearbeiten')).toHaveValue(
    'Auszug bestätigt',
  )
  await expect(page.getByLabel('Auszug bearbeiten')).toHaveValue('2026-06-30')
})
