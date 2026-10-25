import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeNutrition } from '../src/domain/nutrition.ts';
import { generatePlan } from '../src/domain/planner.ts';
import { buildShoppingList } from '../src/domain/shopping.ts';
import { buildTimelines, scheduleSession } from '../src/domain/timeline.ts';
import type { PlanData, Recipe } from '../src/types.ts';
import { baseSettings, seededRandom, seededRecipes } from './helpers.ts';

const recipes = seededRecipes();
const byId = new Map(recipes.map((r) => [r.id, r]));
const find = (title: string) => recipes.find((r) => r.title === title)!;

function planWith(...entries: [Recipe, number][]): PlanData {
  const meals = entries.flatMap(([r, n]) =>
    Array.from({ length: n }, (_, i) => ({ day: i, date: '', slot: 'mittag' as const, recipeId: r.id, session: 0 })),
  );
  return { meals, sessions: [{ index: 0, prepDate: '2026-10-25', days: [0, 1, 2, 3, 4] }], warnings: [] };
}

test('skaliert und summiert Zutaten über Rezepte hinweg', () => {
  const sin = find('Chili sin Carne');
  const con = find('Chili con Carne');
  // 3× bzw. 2× für 2 Personen = 6 bzw. 4 Portionen; Rezepte sind für 4.
  const groups = buildShoppingList(planWith([sin, 3], [con, 2]), 2, byId);
  const items = groups.flatMap((g) => g.items);
  const onion = items.find((i) => i.name.startsWith('Zwiebel'))!;
  assert.equal(onion.amount, 2 * 1.5 + 2 * 1); // 5 Stück
  assert.deepEqual(onion.recipes.sort(), ['Chili con Carne', 'Chili sin Carne']);
  const rice = items.find((i) => i.name === 'Reis')!;
  assert.deepEqual([rice.amount, rice.unit], [500, 'g']);
  const beans = items.find((i) => i.name === 'Kidneybohnen')!;
  assert.deepEqual([beans.amount, beans.unit], [4, 'Dose']); // 2 × 1,5 + 1 × 1 Dose
  const salt = items.filter((i) => i.name === 'Salz');
  assert.equal(salt.length, 1);
  assert.equal(salt[0].amount, null);
  // Gruppiert in fester Reihenfolge, Gemüse zuerst.
  assert.equal(groups[0].category, 'obst-gemuese');
});

test('Kilogramm-Darstellung ab 1000 g', () => {
  const gulasch = find('Rindergulasch mit Kartoffeln');
  const items = buildShoppingList(planWith([gulasch, 4]), 2, byId).flatMap((g) => g.items);
  const meat = items.find((i) => i.name === 'Rindergulasch')!;
  assert.deepEqual([meat.amount, meat.unit], [1.6, 'kg']);
});

test('Ablaufplan: aktive Schritte überlappen nie, Rezeptreihenfolge bleibt', () => {
  const plan = generatePlan(baseSettings, recipes, { random: seededRandom(7) });
  const [timeline] = buildTimelines(plan, 2, byId);
  const active = timeline.tasks.filter((t) => !t.passive).sort((a, b) => a.start - b.start);
  for (let i = 1; i < active.length; i++) assert.ok(active[i].start >= active[i - 1].end, 'aktive Schritte überlappen');
  for (const r of timeline.containers) {
    const steps = timeline.tasks.filter((t) => t.recipeId === r.recipeId).sort((a, b) => a.stepIndex - b.stepIndex);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i].start >= steps[i - 1].end, 'Schrittfolge verletzt');
  }
  assert.equal(timeline.containers.reduce((s, c) => s + c.portions, 0), 20);
  assert.equal(timeline.tasks.at(-1)!.recipeTitle, 'Abschluss');
});

test('Parallelisierung spart Zeit gegenüber Nacheinander-Kochen', () => {
  const entries = [find('Rindergulasch mit Kartoffeln'), find('Rotes Linsen-Dal'), find('Ofengemüse mit Kichererbsen und Feta')].map((recipe) => ({
    recipe,
    portions: recipe.servings,
  }));
  const tasks = scheduleSession(entries);
  const parallel = Math.max(...tasks.map((t) => t.end));
  const sequential = entries.reduce((s, e) => s + e.recipe.steps.reduce((a, st) => a + st.minutes, 0), 0);
  assert.ok(parallel < sequential * 0.7, `${parallel} min parallel vs. ${sequential} min nacheinander`);
});

test('Nährwerte pro Tag und Durchschnitt', () => {
  const sin = find('Chili sin Carne');
  const summary = summarizeNutrition(planWith([sin, 2]), byId, 2000);
  assert.equal(summary.days.length, 2);
  assert.equal(summary.days[0].total.kcal, sin.nutrition!.kcal);
  assert.equal(summary.average.kcal, sin.nutrition!.kcal);
  assert.equal(summary.target, 2000);
});

test('EL und TL werden zusammengefasst, Zehen aufgerundet', () => {
  const a = find('Chili sin Carne'); // 2 TL Paprikapulver, 2 Zehen Knoblauch
  const b = { ...a, id: 999, title: 'Test', servings: 4, ingredients: [
    { name: 'Paprikapulver', amount: 1, unit: 'EL', category: 'gewuerze-oele' as const },
    { name: 'Knoblauch', amount: 0.5, unit: 'Zehe', category: 'obst-gemuese' as const },
  ] };
  const map = new Map([...byId, [999, b]]);
  const items = buildShoppingList(planWith([a, 2], [b, 2]), 2, map).flatMap((g) => g.items);
  const paprika = items.filter((i) => i.name === 'Paprikapulver');
  assert.equal(paprika.length, 1);
  assert.deepEqual([paprika[0].amount, paprika[0].unit], [5, 'TL']); // 2 TL + 1 EL
  const garlic = items.find((i) => i.name === 'Knoblauch')!;
  assert.deepEqual([garlic.amount, garlic.unit], [3, 'Zehe']); // 2 + 0,5 → 3
});
