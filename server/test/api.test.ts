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
  const wednesday = await app.inject({ method: 'POST', url: '/api/plans', payload: { ...baseSettings, weekStart: '2026-10-28' } });
  assert.equal(wednesday.statusCode, 400);
  assert.match(wednesday.json().error, /Montag/);
  const invalid = await app.inject({ method: 'POST', url: '/api/plans', payload: { ...baseSettings, weekStart: '2026-13-45' } });
  assert.equal(invalid.statusCode, 400);
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

test('neue Grundrezepte werden nachgeliefert, gelöschte kommen nicht zurück', async () => {
  const db = openDatabase(':memory:');
  // Stand vor der Versionierung: nur der erste Rezeptsatz, ein Rezept wurde gelöscht.
  const { RecipeRepo } = await import('../src/repo/recipes.ts');
  const { seedRecipes } = await import('../src/seed/recipes.ts');
  const repo = new RecipeRepo(db);
  const v1 = seedRecipes().filter((r) => r.title !== 'Baked Oats mit Banane').slice(0, 22);
  for (const r of v1.slice(1)) repo.create(r);

  const app = await buildApp({ db });
  const titles = (await app.inject('/api/recipes')).json().map((r: { title: string }) => r.title);
  assert.ok(titles.includes('Baked Oats mit Banane'), 'neues Rezept nachgeliefert');
  assert.ok(!titles.includes(v1[0].title), 'gelöschtes Grundrezept bleibt gelöscht');

  const deleted = (await app.inject('/api/recipes')).json().find((r: { title: string }) => r.title === 'Minestrone');
  await app.inject({ method: 'DELETE', url: `/api/recipes/${deleted.id}` });
  const again = await buildApp({ db });
  const after = (await again.inject('/api/recipes')).json().map((r: { title: string }) => r.title);
  assert.ok(!after.includes('Minestrone'), 'bei erneutem Start nicht wieder angelegt');
});

test('alte Pläne ohne Präferenzen bleiben lesbar', async () => {
  const db = openDatabase(':memory:');
  const app = await buildApp({ db });
  const { preferences: _, ...old } = baseSettings;
  db.prepare('INSERT INTO plans (settings, data) VALUES (?, ?)').run(JSON.stringify(old), JSON.stringify({ meals: [], sessions: [], warnings: [] }));
  const plan = (await app.inject('/api/plans/1')).json();
  assert.deepEqual(plan.settings.preferences, []);
  const created = await app.inject({ method: 'POST', url: '/api/plans', payload: { ...old, preferences: ['lowcarb'] } });
  assert.deepEqual(created.json().settings.preferences, ['lowcarb']);
  assert.equal((await app.inject({ method: 'POST', url: '/api/plans', payload: { ...old, preferences: ['vegan'] } })).statusCode, 400);
});
