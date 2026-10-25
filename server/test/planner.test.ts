import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSessions, generatePlan, swapRecipe } from '../src/domain/planner.ts';
import { baseSettings, seededRandom, seededRecipes } from './helpers.ts';

const recipes = seededRecipes();
const byId = new Map(recipes.map((r) => [r.id, r]));

test('Kochtag ist der Vortag, zwei Kochtage teilen die Woche', () => {
  assert.deepEqual(buildSessions(baseSettings), [{ index: 0, prepDate: '2026-10-25', days: [0, 1, 2, 3, 4] }]);
  const two = buildSessions({ ...baseSettings, prepSessions: 2 });
  assert.deepEqual(two.map((s) => s.days), [[0, 1, 2], [3, 4]]);
  const plan = generatePlan({ ...baseSettings, prepSessions: 2 }, recipes, { random: seededRandom() });
  // Kurze Kochblöcke: ein Gericht pro Mahlzeit, das für alle Tage reicht.
  for (const s of plan.sessions) for (const slot of baseSettings.slots) {
    assert.equal(new Set(plan.meals.filter((m) => m.session === s.index && m.slot === slot).map((m) => m.recipeId)).size, 1);
  }
  assert.equal(two[1].prepDate, '2026-10-28');
});

test('füllt jede Mahlzeit mit passendem Rezept', () => {
  const plan = generatePlan(baseSettings, recipes, { random: seededRandom() });
  assert.equal(plan.meals.length, 10);
  for (const m of plan.meals) {
    const r = byId.get(m.recipeId!);
    assert.ok(r, 'Rezept zugewiesen');
    assert.ok(r.mealTypes.includes(m.slot));
  }
  // Mittag und Abend bekommen je 2 verschiedene Gerichte, keins doppelt.
  const ids = new Set(plan.meals.map((m) => m.recipeId));
  assert.equal(ids.size, 4);
  // Kein Gericht mittags und abends am selben Tag.
  for (const day of baseSettings.days) {
    const [a, b] = plan.meals.filter((m) => m.day === day);
    assert.notEqual(a.recipeId, b.recipeId);
  }
});

test('respektiert Ernährungsform und Ausschlüsse', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const plan = generatePlan({ ...baseSettings, diet: 'vegan', excludeIngredients: ['kokos'] }, recipes, { random: seededRandom(seed) });
    for (const m of plan.meals) {
      if (m.recipeId == null) continue;
      const r = byId.get(m.recipeId)!;
      assert.equal(r.diet, 'vegan');
      assert.ok(!r.ingredients.some((i) => i.name.toLowerCase().includes('kokos')), `${r.title} enthält Kokos`);
    }
  }
});

test('warnt, wenn nichts passt', () => {
  const noSnacks = recipes.filter((r) => !r.mealTypes.includes('snack'));
  const plan = generatePlan({ ...baseSettings, slots: ['snack'] }, noSnacks);
  assert.ok(plan.meals.every((m) => m.recipeId == null));
  assert.match(plan.warnings[0], /Kein passendes Rezept für Snack/);
});

test('kurz haltbare Gerichte nicht am Wochenende einer 7-Tage-Woche', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const settings = { ...baseSettings, days: [0, 1, 2, 3, 4, 5, 6], prepSessions: 2 as const };
    const plan = generatePlan(settings, recipes, { random: seededRandom(seed) });
    for (const m of plan.meals) {
      const r = byId.get(m.recipeId!)!;
      const session = plan.sessions[m.session];
      const offset = m.day - (session.days[0] - 1);
      if (!r.freezable) assert.ok(offset <= r.fridgeDays || plan.warnings.length > 0, `${r.title} an Tag ${m.day} nicht mehr frisch`);
    }
  }
});

test('Austauschen ersetzt alle Vorkommen eines Gerichts', () => {
  const plan = generatePlan(baseSettings, recipes, { random: seededRandom() });
  const target = plan.meals[0];
  const swapped = swapRecipe(plan, baseSettings, recipes, { session: 0, slot: target.slot, recipeId: target.recipeId! });
  const before = plan.meals.filter((m) => m.slot === target.slot && m.recipeId === target.recipeId).length;
  assert.ok(before > 0);
  assert.equal(swapped.meals.filter((m) => m.recipeId === target.recipeId && m.slot === target.slot).length, 0);
  const others = new Set(plan.meals.filter((m) => m.recipeId !== target.recipeId).map((m) => m.recipeId));
  const replacement = swapped.meals[0].recipeId!;
  assert.ok(!others.has(replacement), 'Ersatz ist kein Gericht, das schon im Plan ist');
});

test('Kalorienziel wird anteilig auf die geplanten Mahlzeiten verteilt', async () => {
  const { plannedKcalTarget } = await import('../src/domain/planner.ts');
  assert.equal(plannedKcalTarget({ ...baseSettings, kcalTarget: 2000, slots: ['mittag'] }), 700);
  assert.equal(plannedKcalTarget({ ...baseSettings, kcalTarget: 2000, slots: ['fruehstueck', 'mittag', 'abend', 'snack'] }), 2000);
  assert.equal(plannedKcalTarget({ ...baseSettings, kcalTarget: null }), null);
});

test('Präferenzen „schnell" und „Low Carb" werden bevorzugt', async () => {
  const { isLowCarb, isQuick } = await import('../src/domain/traits.ts');
  for (const seed of [1, 2, 3, 4, 5]) {
    const plan = generatePlan({ ...baseSettings, preferences: ['schnell', 'lowcarb'] }, recipes, { random: seededRandom(seed) });
    for (const m of plan.meals) {
      const r = byId.get(m.recipeId!)!;
      assert.ok(isQuick(r) && isLowCarb(r), `${r.title} ist nicht schnell und low carb`);
    }
  }
  const lowCarbBreakfast = generatePlan({ ...baseSettings, slots: ['fruehstueck'], preferences: ['lowcarb'] }, recipes, { random: seededRandom() });
  for (const m of lowCarbBreakfast.meals) assert.ok(isLowCarb(byId.get(m.recipeId!)!), byId.get(m.recipeId!)!.title);
});

test('Gesamtzeit und aktive Zeit sind getrennte Kriterien', async () => {
  const { activeMinutes, isLowEffort, isQuick, totalMinutes } = await import('../src/domain/traits.ts');
  const tacos = recipes.find((r) => r.title === 'Fisch-Taco-Bowl')!;
  assert.equal(totalMinutes(tacos), 76); // inkl. 30 Min. Auftauen
  assert.equal(activeMinutes(tacos), 13);
  assert.ok(!isQuick(tacos) && isLowEffort(tacos), 'wenig Arbeit, aber nicht schnell fertig');
  const gulasch = recipes.find((r) => r.title === 'Rindergulasch mit Kartoffeln')!;
  assert.ok(!isQuick(gulasch) && !isLowEffort(gulasch), `Gulasch: ${activeMinutes(gulasch)} Min. aktiv`);
  for (const r of recipes) assert.ok(activeMinutes(r) <= totalMinutes(r));

  const plan = generatePlan({ ...baseSettings, preferences: ['wenigAufwand'] }, recipes, { random: seededRandom() });
  for (const m of plan.meals) assert.ok(isLowEffort(byId.get(m.recipeId!)!), byId.get(m.recipeId!)!.title);
});

test('genug schnelle und Low-Carb-Rezepte für abwechslungsreiche Pläne', async () => {
  const { isLowCarb, isQuick } = await import('../src/domain/traits.ts');
  const mains = recipes.filter((r) => r.mealTypes.includes('mittag') || r.mealTypes.includes('abend'));
  assert.ok(mains.filter(isQuick).length >= 12, 'schnelle Hauptgerichte');
  assert.ok(mains.filter(isLowCarb).length >= 12, 'Low-Carb-Hauptgerichte');
  assert.ok(recipes.filter((r) => r.mealTypes.includes('fruehstueck') && isLowCarb(r)).length >= 4, 'Low-Carb-Frühstück');
});
