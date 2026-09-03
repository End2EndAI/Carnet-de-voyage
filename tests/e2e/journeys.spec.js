import { expect, test } from '@playwright/test';
import { fakeBackend, signIn, trip } from './fake-backend.js';

test('signs in and creates a usable trip when AI is unavailable', async ({ page }) => {
  const state = await fakeBackend(page);
  await signIn(page);
  await page.getByRole('button', { name: '+ Nouveau voyage' }).click();
  await page.getByPlaceholder('Corée du Sud, Sicile, Nord du Portugal…').fill('Sicile');
  for (let step = 0; step < 4; step += 1) await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Créer le carnet' }).click();
  await expect(page.getByText(/suggestions n'ont pas pu être générées/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sicile' }).first()).toBeVisible();
  expect(state.trips).toHaveLength(1);
});

test('creates, edits, favorites, filters, and deletes an idea', async ({ page }) => {
  await fakeBackend(page, { trips: [trip()] });
  await signIn(page);
  await page.getByRole('button', { name: /Sicile/ }).first().click();
  await page.getByRole('button', { name: '+ Ajouter' }).click();
  await page.getByPlaceholder('Ex : Café Onion Seongsu, Duomo di Catania…').fill('Duomo');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Duomo' })).toBeVisible();

  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
  await page.getByRole('button', { name: '★ Favoris' }).click();
  await expect(page.getByRole('heading', { name: 'Duomo' })).toBeVisible();
  await page.getByRole('button', { name: 'Duomo' }).click();
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByPlaceholder('Ex : Café Onion Seongsu, Duomo di Catania…').fill('Duomo de Catane');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Duomo de Catane' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Duomo de Catane' })).toHaveCount(0);
});

test('enforces read-only and writer controls in the UI', async ({ browser }) => {
  for (const [access, canWrite] of [['read', false], ['write', true]]) {
    const page = await browser.newPage();
    await fakeBackend(page, { access, trips: [trip({ user_id: 'someone-else' })] });
    await signIn(page);
    await page.getByRole('button', { name: /Sicile/ }).first().click();
    await expect(page.getByText(canWrite ? 'Voyage partagé · écriture' : 'Voyage partagé · lecture seule')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Ajouter' })).toHaveCount(canWrite ? 1 : 0);
    await page.close();
  }
});

test('owner shares a trip with an existing account', async ({ page }) => {
  const state = await fakeBackend(page, { trips: [trip()] });
  await signIn(page);
  await page.getByRole('button', { name: 'Partager', exact: true }).click();
  await page.locator('input[type="email"]').fill('friend@example.com');
  await page.getByRole('button', { name: 'Partager', exact: true }).last().click();
  await expect(page.getByText('friend@example.com')).toBeVisible();
  expect(state.shares).toEqual([{ user_id: 'member-1', email: 'friend@example.com', access: 'read' }]);
});

test('deletes a trip and its ideas', async ({ page }) => {
  const state = await fakeBackend(page, { trips: [trip()], ideas: [{
    id: 'idea-1', trip_id: 'trip-1', city: 'catane', title: 'Duomo', verdict: 'voir', origin: 'perso', position: 0,
  }] });
  await signIn(page);
  await page.getByRole('button', { name: 'Supprimer Sicile' }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByText('Aucun carnet')).toBeVisible();
  expect(state.trips).toHaveLength(0);
  expect(state.ideas).toHaveLength(0);
});

test('offers a report link on AI suggestions, and the legal pages without an account', async ({ page }) => {
  await fakeBackend(page, { trips: [trip()], ideas: [
    { id: 'idea-1', trip_id: 'trip-1', city: 'catane', title: 'Duomo', verdict: 'voir', origin: 'suggestion', position: 0 },
    { id: 'idea-2', trip_id: 'trip-1', city: 'catane', title: 'Mon adresse', verdict: 'voir', origin: 'perso', position: 1 },
  ] });

  // Les pages légales doivent être atteignables sans compte.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Confidentialité' })).toBeVisible();

  // La politique Play sur l'IA générative exige un signalement dans l'app,
  // et seulement sur ce que l'IA a produit.
  await signIn(page);
  await page.getByRole('button', { name: /Sicile/ }).first().click();
  await page.getByRole('button', { name: 'Duomo' }).click();
  await expect(page.getByRole('link', { name: 'Signaler' })).toHaveAttribute('href', /^mailto:.*idea-1/);
  await page.getByRole('button', { name: 'Mon adresse' }).click();
  await expect(page.getByRole('link', { name: 'Signaler' })).toHaveCount(0);
});
