import type { NutritionSummary } from '../../server/src/domain/nutrition.ts';
import type { ShoppingGroup } from '../../server/src/domain/shopping.ts';
import type { SessionTimeline } from '../../server/src/domain/timeline.ts';
import type { MealType, Plan, PlanSettings, Recipe, RecipeInput } from '../../server/src/types.ts';

export type * from '../../server/src/types.ts';
export type { NutritionSummary, SessionTimeline, ShoppingGroup };

export interface ExpandedPlan extends Plan {
  recipes: Record<number, Recipe>;
  shopping: ShoppingGroup[];
  timelines: SessionTimeline[];
  nutrition: NutritionSummary;
}

export interface PlanSummary {
  id: number;
  createdAt: string;
  settings: PlanSettings;
  mealCount: number;
  recipeCount: number;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data as T;
}

export const api = {
  recipes: () => request<Recipe[]>('GET', '/api/recipes'),
  recipe: (id: number) => request<Recipe>('GET', `/api/recipes/${id}`),
  createRecipe: (r: RecipeInput) => request<Recipe>('POST', '/api/recipes', r),
  updateRecipe: (id: number, r: RecipeInput) => request<Recipe>('PUT', `/api/recipes/${id}`, r),
  setFavorite: (id: number, favorite: boolean) => request<Recipe>('PATCH', `/api/recipes/${id}/favorite`, { favorite }),
  deleteRecipe: (id: number) => request<void>('DELETE', `/api/recipes/${id}`),
  importRecipe: (url: string) => request<RecipeInput>('POST', '/api/import', { url }),

  plans: () => request<PlanSummary[]>('GET', '/api/plans'),
  plan: (id: number) => request<ExpandedPlan>('GET', `/api/plans/${id}`),
  createPlan: (s: PlanSettings) => request<ExpandedPlan>('POST', '/api/plans', s),
  swap: (id: number, session: number, slot: MealType, recipeId: number) =>
    request<ExpandedPlan>('POST', `/api/plans/${id}/swap`, { session, slot, recipeId }),
  setChecked: (id: number, checked: string[]) => request<{ checked: string[] }>('PUT', `/api/plans/${id}/checked`, { checked }),
  deletePlan: (id: number) => request<void>('DELETE', `/api/plans/${id}`),
};
