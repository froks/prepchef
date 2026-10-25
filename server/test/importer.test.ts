import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImportError, importFromUrl, parseDuration } from '../src/domain/importer.ts';

const page = (ld: unknown) =>
  `<html><head><script type="application/ld+json">{"@type":"WebSite"}</script>
   <script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

const fakeFetch = (html: string, status = 200) =>
  (async () => new Response(html, { status, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;

const chefkochLike = {
  '@context': 'http://schema.org',
  '@type': 'Recipe',
  name: 'Linsensuppe &amp; Würstchen',
  description: 'Omas Linsensuppe',
  recipeYield: '4 Portionen',
  prepTime: 'P0DT0H20M',
  cookTime: 'P0DT0H40M',
  totalTime: 'P0DT1H0M',
  image: ['https://img.example/1.jpg'],
  recipeCategory: 'Hauptspeise',
  keywords: 'Suppe, Eintopf, Herbst',
  recipeIngredient: ['250 g Linsen, getrocknet', '2 Karotten', '4 Wiener Würstchen', '1 Zwiebel', '1 EL Essig', 'Salz'],
  recipeInstructions:
    'Linsen 2 Stunden einweichen.\nZwiebel und Karotten würfeln und anschwitzen.\nAlles 30 Minuten köcheln lassen.\nWürstchen in Scheiben dazugeben.',
  nutrition: { '@type': 'NutritionInformation', calories: '450 kcal', proteinContent: '28g', fatContent: '15,5g', carbohydrateContent: '45g' },
};

test('importiert Chefkoch-artige JSON-LD-Daten', async () => {
  const r = await importFromUrl('https://www.chefkoch.de/rezepte/123/linsensuppe.html', fakeFetch(page(chefkochLike)));
  assert.equal(r.title, 'Linsensuppe & Würstchen');
  assert.equal(r.servings, 4);
  assert.equal(r.ingredients.length, 6);
  assert.deepEqual(r.ingredients[0], { name: 'Linsen', amount: 250, unit: 'g', category: 'trockenwaren', note: 'getrocknet' });
  assert.equal(r.steps.length, 4);
  assert.deepEqual(r.steps[0], { text: 'Linsen 2 Stunden einweichen.', minutes: 120, passive: true });
  assert.equal(r.steps[2].minutes, 30);
  assert.equal(r.steps[2].passive, true);
  assert.deepEqual(r.nutrition, { kcal: 450, protein: 28, carbs: 45, fat: 16 });
  assert.equal(r.imageUrl, 'https://img.example/1.jpg');
  assert.equal(r.diet, 'alles'); // Würstchen
  assert.deepEqual(r.mealTypes, ['mittag', 'abend']);
  assert.ok(r.tags.includes('suppe'));
  assert.equal(r.sourceUrl, 'https://www.chefkoch.de/rezepte/123/linsensuppe.html');
});

test('findet Rezepte in @graph und HowToSection-Anleitungen', async () => {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'Blog' },
      {
        '@type': ['Recipe'],
        name: 'Porridge',
        recipeYield: 2,
        keywords: ['Frühstück'],
        recipeIngredient: ['80 g Haferflocken', '300 ml Hafermilch'],
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Kochen', itemListElement: [{ '@type': 'HowToStep', text: 'Aufkochen.' }, { '@type': 'HowToStep', text: 'Quellen lassen.' }] },
        ],
        totalTime: 'PT10M',
      },
    ],
  };
  const r = await importFromUrl('https://blog.example/porridge', fakeFetch(page(ld)));
  assert.equal(r.title, 'Porridge');
  assert.equal(r.servings, 2);
  assert.deepEqual(r.steps.map((s) => s.text), ['Aufkochen.', 'Quellen lassen.']);
  assert.deepEqual(r.steps.map((s) => s.minutes), [5, 5]);
  assert.deepEqual(r.mealTypes, ['fruehstueck']);
  assert.equal(r.diet, 'vegan');
  assert.equal(r.nutrition, null);
});

test('verständliche Fehler', async () => {
  await assert.rejects(importFromUrl('kein link'), ImportError);
  await assert.rejects(importFromUrl('file:///etc/passwd'), /http/);
  await assert.rejects(importFromUrl('https://x.example', fakeFetch('<html></html>')), /keine strukturierten Rezeptdaten/);
  await assert.rejects(importFromUrl('https://x.example', fakeFetch('', 403)), /Status 403/);
});

test('ISO-Dauern', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('P0DT0H20M'), 20);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration(undefined), 0);
});

test('Tipp-Absätze werden an den vorherigen Schritt gehängt', async () => {
  const ld = {
    '@type': 'Recipe',
    name: 'X',
    recipeIngredient: ['1 Bund Petersilie (oder TK)', '2 TL Zitronensaft', '3 Erbsen (TK)'],
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Anbraten, 5 Min.' }, { '@type': 'HowToStep', text: 'Tipp: 20 Min. ruhen lassen geht auch.' }],
  };
  const r = await importFromUrl('https://x.example', fakeFetch(page(ld)));
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].minutes, 5);
  assert.deepEqual(r.ingredients.map((i) => i.category), ['obst-gemuese', 'obst-gemuese', 'tiefkuehl']);
});
