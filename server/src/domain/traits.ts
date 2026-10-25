import type { Preference, Recipe, RecipeInput } from '../types.ts';

/** Grenzwerte für die abgeleiteten Eigenschaften – bewusst aus den Rezeptdaten berechnet statt von Hand gepflegt. */
export const QUICK_MAX_MINUTES = 30;
export const LOW_CARB_MAX_GRAMS = 25;

type RecipeLike = Pick<RecipeInput, 'steps' | 'nutrition' | 'tags'>;

/** Gesamtzeit vom Start bis zum fertigen Gericht, wenn man die Schritte nacheinander abarbeitet. */
export function totalMinutes(r: RecipeLike): number {
  return r.steps.reduce((s, st) => s + st.minutes, 0);
}

export function isQuick(r: RecipeLike): boolean {
  return r.steps.length > 0 && totalMinutes(r) <= QUICK_MAX_MINUTES;
}

/** Nach Nährwerten, oder per Tag „low-carb", wenn keine Nährwerte hinterlegt sind. */
export function isLowCarb(r: RecipeLike): boolean {
  if (r.nutrition) return r.nutrition.carbs <= LOW_CARB_MAX_GRAMS;
  return r.tags.includes('low-carb');
}

export function matchesPreference(r: Recipe | RecipeInput, p: Preference): boolean {
  return p === 'schnell' ? isQuick(r) : isLowCarb(r);
}
