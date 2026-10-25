import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { baseSettings } from './helpers.ts';

async function setup() {
  return buildApp({ db: openDatabase(':memory:') });
}

test('Rezepte: Seed, anlegen, ändern, favorisieren, löschen', async () => {
  const app = await setup();
  const list = (await app.inject('/api/recipes')).json();
  assert.ok(list.length >= 20);

  const created = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    payload: {
      title: 'Testsalat',
      servings: 2,
      mealTypes: ['mittag'],
      diet: 'vegan',
      ingredients: [{ name: 'Gurke', amount: 1, unit: '', category: 'obst-gemuese' }],
      steps: [{ text: 'Schneiden', minutes: 5 }],
    },
  });
  assert.equal(created.statusCode, 201);
  const r = created.json();
  assert.equal(r.fridgeDays, 3);
  assert.equal(r.steps[0].passive, false);

  const updated = await app.inject({ method: 'PUT', url: `/api/recipes/${r.id}`, payload: { ...r, title: 'Gurkensalat' } });
  assert.equal(updated.json().title, 'Gurkensalat');

  const fav = await app.inject({ method: 'PATCH', url: `/api/recipes/${r.id}/favorite`, payload: { favorite: true } });
  assert.equal(fav.json().favorite, true);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/recipes/${r.id}` })).statusCode, 204);
  assert.equal((await app.inject(`/api/recipes/${r.id}`)).statusCode, 404);
});

test('ungültige Eingaben werden abgelehnt', async () => {
  const app = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/recipes', payload: { title: '' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /Ungültige Eingabe/);
  const plan = await app.inject({ method: 'POST', url: '/api/plans', payload: { ...baseSettings, days: [9] } });
  assert.equal(plan.statusCode, 400);
});

test('Plan erstellen, abhaken, austauschen, löschen', async () => {
  const app = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/plans', payload: baseSettings });
  assert.equal(res.statusCode, 201);
  const plan = res.json();
  assert.equal(plan.data.meals.length, 10);
  assert.ok(plan.shopping.length > 0);
  assert.equal(plan.timelines.length, 1);
  assert.equal(plan.nutrition.days.length, 5);
  assert.ok(Object.keys(plan.recipes).length >= 2);

  const key = plan.shopping[0].items[0].key;
  const checked = await app.inject({ method: 'PUT', url: `/api/plans/${plan.id}/checked`, payload: { checked: [key] } });
  assert.deepEqual(checked.json().checked, [key]);

  const meal = plan.data.meals[0];
  const swapped = (
    await app.inject({ method: 'POST', url: `/api/plans/${plan.id}/swap`, payload: { session: 0, slot: meal.slot, recipeId: meal.recipeId } })
  ).json();
  assert.notEqual(swapped.data.meals[0].recipeId, meal.recipeId);

  const list = (await app.inject('/api/plans')).json();
  assert.equal(list[0].id, plan.id);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/plans/${plan.id}` })).statusCode, 204);
});

test('Import-Fehler liefert 422 mit Meldung', async () => {
  const app = await buildApp({
    db: openDatabase(':memory:'),
    fetchImpl: (async () => new Response('<html></html>')) as unknown as typeof fetch,
  });
  const res = await app.inject({ method: 'POST', url: '/api/import', payload: { url: 'https://example.com/x' } });
  assert.equal(res.statusCode, 422);
  assert.match(res.json().error, /schema.org/);
});
