import type { MealType, Nutrition, PlanData, Recipe } from '../types.ts';

export interface DayNutrition {
  day: number;
  date: string;
  /** Pro Person. */
  total: Nutrition;
  meals: { slot: MealType; recipeId: number | null; nutrition: Nutrition | null }[];
  /** Mindestens ein Gericht des Tages hat keine Nährwertangaben. */
  incomplete: boolean;
}

export interface NutritionSummary {
  days: DayNutrition[];
  average: Nutrition;
  /** Ziel für die geplanten Mahlzeiten (Anteil am Tagesziel). */
  target: number | null;
  /** Tagesziel aus den Einstellungen. */
  dailyTarget: number | null;
}

const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function add(a: Nutrition, b: Nutrition): Nutrition {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function summarizeNutrition(
  plan: PlanData,
  recipes: Map<number, Recipe>,
  target: number | null,
  dailyTarget: number | null = target,
): NutritionSummary {
  const byDay = new Map<number, DayNutrition>();
  for (const m of plan.meals) {
    let day = byDay.get(m.day);
    if (!day) {
      day = { day: m.day, date: m.date, total: { ...ZERO }, meals: [], incomplete: false };
      byDay.set(m.day, day);
    }
    const n = m.recipeId != null ? (recipes.get(m.recipeId)?.nutrition ?? null) : null;
    day.meals.push({ slot: m.slot, recipeId: m.recipeId, nutrition: n });
    if (n) day.total = add(day.total, n);
    else if (m.recipeId != null) day.incomplete = true;
  }
  const days = [...byDay.values()].sort((a, b) => a.day - b.day);
  const sum = days.reduce((s, d) => add(s, d.total), { ...ZERO });
  const count = Math.max(1, days.length);
  const average = {
    kcal: Math.round(sum.kcal / count),
    protein: Math.round(sum.protein / count),
    carbs: Math.round(sum.carbs / count),
    fat: Math.round(sum.fat / count),
  };
  return { days, average, target, dailyTarget };
}
