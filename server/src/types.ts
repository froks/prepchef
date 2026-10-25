export const DIETS = ['vegan', 'vegetarisch', 'pescetarisch', 'alles'] as const;
export type Diet = (typeof DIETS)[number];

export const MEAL_TYPES = ['fruehstueck', 'mittag', 'abend', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const CATEGORIES = [
  'obst-gemuese',
  'fleisch-fisch',
  'milch-kuehl',
  'brot-backwaren',
  'trockenwaren',
  'konserven',
  'gewuerze-oele',
  'tiefkuehl',
  'getraenke',
  'sonstiges',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Ingredient {
  name: string;
  amount: number | null;
  unit: string;
  category: Category;
  note?: string;
}

export interface Step {
  text: string;
  /** Geschätzte Dauer in Minuten. */
  minutes: number;
  /** Läuft ohne Aufsicht (Ofen, Köcheln, Ziehen lassen) – die Köchin/der Koch ist währenddessen frei. */
  passive: boolean;
}

/** Nährwerte pro Portion. */
export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface RecipeInput {
  title: string;
  description: string;
  servings: number;
  mealTypes: MealType[];
  diet: Diet;
  tags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  nutrition: Nutrition | null;
  /** Wie viele Tage das fertige Gericht im Kühlschrank hält. */
  fridgeDays: number;
  freezable: boolean;
  favorite: boolean;
  sourceUrl: string | null;
  imageUrl: string | null;
}

export interface Recipe extends RecipeInput {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanSettings {
  /** Montag der Woche, YYYY-MM-DD. */
  weekStart: string;
  /** Wochentage, 0 = Montag … 6 = Sonntag. */
  days: number[];
  slots: MealType[];
  persons: number;
  /** Kalorienziel pro Person und Tag, null = egal. */
  kcalTarget: number | null;
  diet: Diet;
  /** 1 = ein Kochtag für die ganze Woche, 2 = zusätzlicher Kochtag zur Wochenmitte. */
  prepSessions: 1 | 2;
  /** Wie viele verschiedene Gerichte pro Mahlzeit und Kochtag. */
  recipesPerSlot: number;
  excludeIngredients: string[];
}

export interface PlannedMeal {
  day: number;
  date: string;
  slot: MealType;
  recipeId: number | null;
  session: number;
}

export interface PrepSession {
  index: number;
  /** Datum des Kochtags (Tag vor dem ersten versorgten Tag). */
  prepDate: string;
  days: number[];
}

export interface PlanData {
  meals: PlannedMeal[];
  sessions: PrepSession[];
  warnings: string[];
}

export interface Plan {
  id: number;
  settings: PlanSettings;
  data: PlanData;
  /** Abgehakte Einträge der Einkaufsliste. */
  checked: string[];
  createdAt: string;
}
