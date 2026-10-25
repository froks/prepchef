import type { Preference, Recipe, RecipeInput } from '../types.ts';

/** Grenzwerte für die abgeleiteten Eigenschaften – bewusst aus den Rezeptdaten berechnet statt von Hand gepflegt. */
/** „Schnell fertig": Gesamtzeit vom ersten Schnitt bis zum fertigen Gericht. */
export const QUICK_MAX_MINUTES = 30;
/** „Wenig Aufwand": aktive Zeit – Garen, Backen und Auftauen laufen beim Meal-Prep nebenbei. */
export const LOW_EFFORT_MAX_MINUTES = 20;
export const LOW_CARB_MAX_GRAMS = 25;

type RecipeLike = Pick<RecipeInput, 'steps' | 'nutrition' | 'tags'>;

/** Gesamtzeit vom Start bis zum fertigen Gericht, wenn man die Schritte nacheinander abarbeitet – inkl. Garen, Backen, Auftauen. */
export function totalMinutes(r: RecipeLike): number {
  return r.steps.reduce((s, st) => s + st.minutes, 0);
}

/** Aktive Koch- und Vorbereitungszeit: nur Schritte, bei denen man selbst am Herd oder Brett steht. */
export function activeMinutes(r: RecipeLike): number {
  return r.steps.reduce((s, st) => s + (st.passive ? 0 : st.minutes), 0);
}

export function isQuick(r: RecipeLike): boolean {
  return r.steps.length > 0 && totalMinutes(r) <= QUICK_MAX_MINUTES;
}

export function isLowEffort(r: RecipeLike): boolean {
  return r.steps.length > 0 && activeMinutes(r) <= LOW_EFFORT_MAX_MINUTES;
}

/** Nach Nährwerten, oder per Tag „low-carb", wenn keine Nährwerte hinterlegt sind. */
export function isLowCarb(r: RecipeLike): boolean {
  if (r.nutrition) return r.nutrition.carbs <= LOW_CARB_MAX_GRAMS;
  return r.tags.includes('low-carb');
}

export function matchesPreference(r: Recipe | RecipeInput, p: Preference): boolean {
  switch (p) {
    case 'schnell':
      return isQuick(r);
    case 'wenigAufwand':
      return isLowEffort(r);
    case 'lowcarb':
      return isLowCarb(r);
  }
}
