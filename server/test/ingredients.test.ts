import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guessCategory, guessDiet, ingredientKey, parseIngredient } from '../src/domain/ingredients.ts';
import { seedRecipes } from '../src/seed/recipes.ts';

test('parst Mengen, Einheiten und Anmerkungen', () => {
  assert.deepEqual(parseIngredient('200 g Mehl'), { name: 'Mehl', amount: 200, unit: 'g', category: 'trockenwaren' });
  assert.equal(parseIngredient('1,5 kg Kartoffeln').amount, 1.5);
  assert.equal(parseIngredient('1/2 TL Salz').amount, 0.5);
  assert.equal(parseIngredient('1 ½ EL Olivenöl').amount, 1.5);
  assert.equal(parseIngredient('½ Zitrone').amount, 0.5);
  assert.equal(parseIngredient('2 1/2 Tassen Reis').amount, 2.5);

  const range = parseIngredient('2-3 Zwiebel(n)');
  assert.equal(range.amount, 3);
  assert.equal(range.name, 'Zwiebel');
  assert.equal(range.note, undefined);

  const can = parseIngredient('1 Dose Tomaten, gehackt (400 g)');
  assert.deepEqual(can, { name: 'Tomaten', amount: 1, unit: 'Dose', category: 'konserven', note: 'gehackt, 400 g' });

  assert.deepEqual(parseIngredient('2 Zehen Knoblauch'), { name: 'Knoblauch', amount: 2, unit: 'Zehe', category: 'obst-gemuese' });
  assert.deepEqual(parseIngredient('Salz und Pfeffer'), { name: 'Salz und Pfeffer', amount: null, unit: '', category: 'gewuerze-oele' });
  assert.equal(parseIngredient('etwas Öl').name, 'Öl');
  assert.equal(parseIngredient('3 Eier').unit, '');
});

test('ordnet Kategorien zu, ohne Teilwort-Fehltreffer', () => {
  assert.equal(guessCategory('Eier'), 'milch-kuehl');
  assert.equal(guessCategory('Olivenöl'), 'gewuerze-oele');
  assert.equal(guessCategory('Frühlingszwiebeln'), 'obst-gemuese');
  assert.equal(guessCategory('Weizenmehl'), 'trockenwaren');
  assert.equal(guessCategory('Kichererbsen'), 'konserven');
  assert.equal(guessCategory('Edamame (TK)'), 'tiefkuehl');
  assert.equal(guessCategory('Hähnchenbrustfilet'), 'fleisch-fisch');
});

test('fasst Singular und Plural zusammen', () => {
  assert.equal(ingredientKey('Zwiebeln'), ingredientKey('Zwiebel'));
  assert.equal(ingredientKey('Eier'), ingredientKey('Ei'));
  assert.equal(ingredientKey('Kartoffeln'), ingredientKey('Kartoffel'));
});

test('erkennt die Ernährungsform', () => {
  const p = (...lines: string[]) => lines.map(parseIngredient);
  assert.equal(guessDiet(p('200 g Hackfleisch', '1 Zwiebel')), 'alles');
  assert.equal(guessDiet(p('2 Lachsfilets', '1 Zitrone')), 'pescetarisch');
  assert.equal(guessDiet(p('2 Eier', '100 g Spinat')), 'vegetarisch');
  assert.equal(guessDiet(p('400 ml Kokosmilch', '2 EL Erdnussbutter', '200 g Reis')), 'vegan');
});

test('Grundrezepte sind sauber geparst und konsistent', () => {
  for (const r of seedRecipes()) {
    for (const i of r.ingredients) {
      assert.ok(i.name.length > 1, `${r.title}: leerer Name`);
      assert.notEqual(i.category, 'sonstiges', `${r.title}: „${i.name}" ohne Kategorie`);
    }
    // Die angegebene Ernährungsform darf nicht lockerer sein, als die Zutaten zulassen.
    const order = ['vegan', 'vegetarisch', 'pescetarisch', 'alles'];
    assert.ok(order.indexOf(guessDiet(r.ingredients)) <= order.indexOf(r.diet), `${r.title}: Ernährungsform passt nicht`);
  }
});
