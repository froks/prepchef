import { seedRecipes } from '../src/seed/recipes.ts';
import type { PlanSettings, Recipe } from '../src/types.ts';

export function seededRecipes(): Recipe[] {
  return seedRecipes().map((r, i) => ({ ...r, id: i + 1, createdAt: '', updatedAt: '' }));
}

/** Deterministischer Pseudozufall (mulberry32). */
export function seededRandom(seed = 42): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const baseSettings: PlanSettings = {
  weekStart: '2026-10-26',
  days: [0, 1, 2, 3, 4],
  slots: ['mittag', 'abend'],
  persons: 2,
  kcalTarget: 2000,
  diet: 'alles',
  prepSessions: 1,
  recipesPerSlot: 2,
  excludeIngredients: [],
};
