import type { Diet, MealType, PlanData, PlannedMeal, PlanSettings, Preference, PrepSession, Recipe } from '../types.ts';
import { ingredientKey, isStaple } from './ingredients.ts';
import { matchesPreference } from './traits.ts';

const DIET_RANK: Record<Diet, number> = { vegan: 0, vegetarisch: 1, pescetarisch: 2, alles: 3 };

/** Ein Rezept passt, wenn es mindestens so streng ist wie die gewünschte Ernährungsform. */
export function fitsDiet(recipe: Diet, wanted: Diet): boolean {
  return DIET_RANK[recipe] <= DIET_RANK[wanted];
}

/** Anteil einer Mahlzeit am Tagesbedarf (zusammen 100 %). */
export const SLOT_WEIGHT: Record<MealType, number> = { fruehstueck: 0.25, mittag: 0.35, abend: 0.3, snack: 0.1 };

export const SLOT_LABEL: Record<MealType, string> = {
  fruehstueck: 'Frühstück',
  mittag: 'Mittagessen',
  abend: 'Abendessen',
  snack: 'Snack',
};

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PlannerOptions {
  /** Zufallsquelle, für Tests deterministisch ersetzbar. */
  random?: () => number;
  /** Rezept-IDs aus den letzten Plänen – werden etwas seltener gewählt. */
  recentlyUsed?: Set<number>;
}

/** Teilt die Tage auf Kochtage auf. Gekocht wird jeweils am Tag vor dem ersten versorgten Tag. */
export function buildSessions(settings: PlanSettings): PrepSession[] {
  const days = [...new Set(settings.days)].sort((a, b) => a - b);
  if (!days.length) return [];
  const groups = settings.prepSessions === 2 && days.length >= 4 ? [days.slice(0, Math.ceil(days.length / 2)), days.slice(Math.ceil(days.length / 2))] : [days];
  return groups.map((g, index) => ({ index, prepDate: addDays(settings.weekStart, g[0] - 1), days: g }));
}

export function generatePlan(settings: PlanSettings, recipes: Recipe[], opts: PlannerOptions = {}): PlanData {
  const random = opts.random ?? Math.random;
  const recent = opts.recentlyUsed ?? new Set<number>();
  const warnings: string[] = [];
  const sessions = buildSessions(settings);
  const meals: PlannedMeal[] = [];

  const excluded = settings.excludeIngredients.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const pool = recipes.filter(
    (r) =>
      fitsDiet(r.diet, settings.diet) &&
      !r.ingredients.some((i) => excluded.some((e) => i.name.toLowerCase().includes(e))),
  );

  const slotTargets = slotKcalTargets(settings);
  // Über alle Kochtage hinweg: Gerichte möglichst nicht wiederholen.
  const usedInWeek = new Set<number>();

  for (const session of sessions) {
    const chosenInSession: Recipe[] = [];

    for (const slot of settings.slots) {
      const candidates = pool.filter((r) => r.mealTypes.includes(slot));
      // Jedes Gericht soll mindestens zwei Mahlzeiten abdecken, sonst lohnt das Vorkochen nicht.
      const count = Math.min(Math.max(1, settings.recipesPerSlot), Math.max(1, Math.floor(session.days.length / 2)));
      const maxOffset = session.days[session.days.length - 1] - (session.days[0] - 1);

      const picked: Recipe[] = [];
      for (let i = 0; i < count; i++) {
        const best = pickBest(candidates, {
          preferences: settings.preferences ?? [],
          chosenInSession,
          usedInWeek,
          recent,
          kcalTarget: slotTargets[slot],
          maxOffset,
          random,
        });
        if (!best) break;
        picked.push(best);
        chosenInSession.push(best);
      }

      if (!picked.length) {
        warnings.push(`Kein passendes Rezept für ${SLOT_LABEL[slot]} gefunden.`);
      }

      const assignment = assignDays(session, picked);
      for (const day of session.days) {
        const recipe = assignment.get(day) ?? null;
        if (recipe) usedInWeek.add(recipe.id);
        meals.push({ day, date: addDays(settings.weekStart, day), slot, recipeId: recipe?.id ?? null, session: session.index });
      }

      const unfresh = session.days.filter((d) => {
        const r = assignment.get(d);
        return r && !r.freezable && d - (session.days[0] - 1) > r.fridgeDays;
      });
      if (unfresh.length) {
        warnings.push(
          `${SLOT_LABEL[slot]} am ${unfresh.map((d) => DAY_NAMES[d]).join(', ')}: Gericht hält nicht so lange im Kühlschrank – ein zweiter Kochtag wäre besser.`,
        );
      }
    }
  }

  return { meals, sessions, warnings };
}

/**
 * Kalorienziel je Mahlzeit. Das Tagesziel gilt für den ganzen Tag – wer nur das Mittagessen
 * vorkocht, bekommt also nur den Mittagsanteil, nicht 2000 kcal in einer Box.
 */
function slotKcalTargets(settings: PlanSettings): Record<MealType, number | null> {
  const result = { fruehstueck: null, mittag: null, abend: null, snack: null } as Record<MealType, number | null>;
  if (!settings.kcalTarget) return result;
  for (const slot of settings.slots) result[slot] = settings.kcalTarget * SLOT_WEIGHT[slot];
  return result;
}

/** Kalorienziel für alle geplanten Mahlzeiten eines Tages zusammen. */
export function plannedKcalTarget(settings: PlanSettings): number | null {
  if (!settings.kcalTarget) return null;
  return Math.round(settings.slots.reduce((s, slot) => s + settings.kcalTarget! * SLOT_WEIGHT[slot], 0));
}

interface PickContext {
  preferences: Preference[];
  chosenInSession: Recipe[];
  usedInWeek: Set<number>;
  recent: Set<number>;
  kcalTarget: number | null;
  maxOffset: number;
  random: () => number;
}

function keySet(r: Recipe): Set<string> {
  return new Set(r.ingredients.filter((i) => !isStaple(i.name)).map((i) => ingredientKey(i.name)));
}

export function scoreRecipe(r: Recipe, ctx: PickContext): number {
  let score = 0;

  // Gemeinsame Zutaten mit den anderen Gerichten des Kochtags → weniger Reste, günstiger Einkauf.
  const mine = keySet(r);
  const shared = new Set<string>();
  for (const other of ctx.chosenInSession) for (const k of keySet(other)) if (mine.has(k)) shared.add(k);
  score += Math.min(shared.size, 5) * 1.5;

  if (ctx.kcalTarget && r.nutrition) {
    const deviation = Math.abs(r.nutrition.kcal - ctx.kcalTarget) / ctx.kcalTarget;
    score -= deviation * 8;
  }

  // Haltbarkeit: Gerichte, die bis zum letzten Tag frisch bleiben, sind beim Meal-Prep Gold wert.
  if (r.freezable || r.fridgeDays >= ctx.maxOffset) score += 2;
  else score -= (ctx.maxOffset - r.fridgeDays) * 1.5;

  // Präferenzen wiegen schwerer als alles andere – ein unpassendes Gericht kommt nur zum Zug, wenn nichts anderes passt.
  for (const p of ctx.preferences) score += matchesPreference(r, p) ? 6 : -6;

  if (r.favorite) score += 2.5;
  if (ctx.recent.has(r.id)) score -= 2;
  if (ctx.usedInWeek.has(r.id)) score -= 6;

  // Abwechslung: nicht zweimal dieselbe Art Gericht (gleiche Tags) am selben Kochtag.
  const tagOverlap = ctx.chosenInSession.reduce((s, o) => s + o.tags.filter((t) => r.tags.includes(t)).length, 0);
  score -= tagOverlap * 1.2;

  // Etwas Zufall, damit „Neu erstellen" auch wirklich neue Pläne liefert.
  score += ctx.random() * 3;
  return score;
}

function pickBest(candidates: Recipe[], ctx: PickContext): Recipe | null {
  let best: Recipe | null = null;
  let bestScore = -Infinity;
  for (const r of candidates) {
    if (ctx.chosenInSession.some((c) => c.id === r.id)) continue;
    const s = scoreRecipe(r, ctx);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Verteilt die gewählten Gerichte auf die Tage: möglichst gleichmäßig, nicht zweimal hintereinander,
 * und kurz haltbare Gerichte zuerst.
 */
export function assignDays(session: PrepSession, picked: Recipe[]): Map<number, Recipe> {
  const result = new Map<number, Recipe>();
  if (!picked.length) return result;
  const prepDay = session.days[0] - 1;
  const counts = new Map<number, number>(picked.map((r) => [r.id, 0]));
  const shelfLife = (r: Recipe) => (r.freezable ? 99 : r.fridgeDays);
  const perRecipe = Math.ceil(session.days.length / picked.length);

  let previous: Recipe | null = null;
  for (const day of session.days) {
    const offset = day - prepDay;
    const ranked = [...picked].sort((a, b) => {
      const freshA = shelfLife(a) >= offset ? 0 : 1;
      const freshB = shelfLife(b) >= offset ? 0 : 1;
      if (freshA !== freshB) return freshA - freshB;
      const fullA = counts.get(a.id)! >= perRecipe ? 1 : 0;
      const fullB = counts.get(b.id)! >= perRecipe ? 1 : 0;
      if (fullA !== fullB) return fullA - fullB;
      const repA = a === previous ? 1 : 0;
      const repB = b === previous ? 1 : 0;
      if (repA !== repB) return repA - repB;
      // Kürzer haltbares zuerst essen.
      if (shelfLife(a) !== shelfLife(b)) return shelfLife(a) - shelfLife(b);
      return counts.get(a.id)! - counts.get(b.id)!;
    });
    const choice = ranked[0];
    result.set(day, choice);
    counts.set(choice.id, counts.get(choice.id)! + 1);
    previous = choice;
  }
  return result;
}

/** Tauscht ein Gericht innerhalb eines Kochtags und einer Mahlzeit gegen das nächstbeste aus. */
export function swapRecipe(
  plan: PlanData,
  settings: PlanSettings,
  recipes: Recipe[],
  target: { session: number; slot: MealType; recipeId: number },
  opts: PlannerOptions = {},
): PlanData {
  const random = opts.random ?? Math.random;
  const session = plan.sessions.find((s) => s.index === target.session);
  if (!session) throw new Error('Unbekannter Kochtag');

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const inSession = plan.meals.filter((m) => m.session === target.session && m.recipeId != null);
  const chosenInSession = [...new Set(inSession.map((m) => m.recipeId!))]
    .filter((id) => id !== target.recipeId)
    .map((id) => byId.get(id))
    .filter((r): r is Recipe => !!r);
  const usedInWeek = new Set(plan.meals.map((m) => m.recipeId).filter((id): id is number => id != null));

  const excluded = settings.excludeIngredients.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const candidates = recipes.filter(
    (r) =>
      r.id !== target.recipeId &&
      r.mealTypes.includes(target.slot) &&
      fitsDiet(r.diet, settings.diet) &&
      !r.ingredients.some((i) => excluded.some((e) => i.name.toLowerCase().includes(e))),
  );

  const replacement = pickBest(candidates, {
    preferences: settings.preferences ?? [],
    chosenInSession,
    usedInWeek,
    recent: opts.recentlyUsed ?? new Set(),
    kcalTarget: slotKcalTargets(settings)[target.slot],
    maxOffset: session.days[session.days.length - 1] - (session.days[0] - 1),
    random,
  });
  if (!replacement) return plan;

  return {
    ...plan,
    meals: plan.meals.map((m) =>
      m.session === target.session && m.slot === target.slot && m.recipeId === target.recipeId
        ? { ...m, recipeId: replacement.id }
        : m,
    ),
  };
}
