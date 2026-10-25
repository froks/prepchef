import type { Category, PlanData, Recipe } from '../types.ts';
import { CATEGORIES } from '../types.ts';
import { ingredientKey } from './ingredients.ts';
import { humanize, toBase } from './units.ts';

export interface ShoppingItem {
  /** Stabiler Schlüssel zum Abhaken. */
  key: string;
  name: string;
  amount: number | null;
  unit: string;
  category: Category;
  /** Für welche Gerichte die Zutat gebraucht wird. */
  recipes: string[];
}

export interface ShoppingGroup {
  category: Category;
  items: ShoppingItem[];
}

/** Wie viele Portionen jedes Rezepts für den Plan gekocht werden. */
export function portionsPerRecipe(plan: PlanData, persons: number): Map<number, number> {
  const portions = new Map<number, number>();
  for (const m of plan.meals) {
    if (m.recipeId == null) continue;
    portions.set(m.recipeId, (portions.get(m.recipeId) ?? 0) + persons);
  }
  return portions;
}

export function buildShoppingList(plan: PlanData, persons: number, recipes: Map<number, Recipe>): ShoppingGroup[] {
  const items = new Map<string, ShoppingItem & { firstName: string }>();

  for (const [recipeId, portions] of portionsPerRecipe(plan, persons)) {
    const recipe = recipes.get(recipeId);
    if (!recipe) continue;
    const factor = portions / Math.max(1, recipe.servings);

    for (const ing of recipe.ingredients) {
      const base = ing.amount != null ? toBase(ing.amount * factor, ing.unit) : null;
      const unit = base?.unit ?? '';
      const key = `${ingredientKey(ing.name)}|${unit}`;
      const existing = items.get(key);
      if (existing) {
        if (base) existing.amount = (existing.amount ?? 0) + base.amount;
        if (!existing.recipes.includes(recipe.title)) existing.recipes.push(recipe.title);
      } else {
        items.set(key, {
          key,
          name: ing.name,
          firstName: ing.name,
          amount: base?.amount ?? null,
          unit,
          category: ing.category,
          recipes: [recipe.title],
        });
      }
    }
  }

  // Eine Zutat ohne Mengenangabe („Salz") neben derselben mit Menge ist doppelt – nur die mit Menge behalten.
  for (const [key, item] of items) {
    if (item.amount == null) {
      const name = key.split('|')[0];
      const other = [...items.values()].find((o) => o !== item && o.key.startsWith(`${name}|`) && o.amount != null);
      if (other) {
        for (const r of item.recipes) if (!other.recipes.includes(r)) other.recipes.push(r);
        items.delete(key);
      }
    }
  }

  const groups = new Map<Category, ShoppingItem[]>();
  for (const { firstName: _, ...item } of items.values()) {
    if (item.amount != null) Object.assign(item, humanize(item.amount, item.unit));
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }

  return CATEGORIES.filter((c) => groups.has(c)).map((category) => ({
    category,
    items: groups.get(category)!.sort((a, b) => a.name.localeCompare(b.name, 'de')),
  }));
}
