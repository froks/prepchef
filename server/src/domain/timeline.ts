import type { PlanData, Recipe } from '../types.ts';
import { portionsPerRecipe } from './shopping.ts';

export interface TimelineTask {
  recipeId: number | null;
  recipeTitle: string;
  stepIndex: number;
  text: string;
  /** Minuten ab Beginn des Kochtags. */
  start: number;
  end: number;
  passive: boolean;
}

export interface SessionTimeline {
  session: number;
  prepDate: string;
  totalMinutes: number;
  /** Davon aktive Arbeitszeit am Herd/Brett. */
  activeMinutes: number;
  tasks: TimelineTask[];
  /** Wie viele Boxen pro Gericht befüllt werden. */
  containers: { recipeId: number; title: string; portions: number }[];
}

/** Mehr Portionen = mehr Schnippelarbeit. Garzeiten bleiben gleich, aktive Schritte wachsen moderat. */
function scaleActive(minutes: number, factor: number): number {
  return Math.round(minutes * (1 + Math.max(0, factor - 1) * 0.35));
}

/**
 * Plant einen Kochtag für eine Person in der Küche: aktive Schritte können nicht gleichzeitig
 * laufen, passive Schritte (Ofen, Köcheln) laufen im Hintergrund weiter. Die Schritte eines
 * Rezepts bleiben in ihrer Reihenfolge. Gierige Listenplanung nach längstem Restpfad.
 */
export function scheduleSession(recipes: { recipe: Recipe; portions: number }[]): TimelineTask[] {
  const queues = recipes.map(({ recipe, portions }) => ({
    recipe,
    next: 0,
    readyAt: 0,
    steps: recipe.steps.map((s) => ({
      ...s,
      minutes: Math.max(1, s.passive ? s.minutes : scaleActive(s.minutes, portions / Math.max(1, recipe.servings))),
    })),
  }));
  const tasks: TimelineTask[] = [];
  let cookFreeAt = 0;
  const remaining = (q: (typeof queues)[number]) => q.steps.slice(q.next).reduce((s, st) => s + st.minutes, 0);

  while (queues.some((q) => q.next < q.steps.length)) {
    const open = queues.filter((q) => q.next < q.steps.length);
    const ready = open.filter((q) => q.readyAt <= cookFreeAt);
    if (!ready.length) {
      cookFreeAt = Math.min(...open.map((q) => q.readyAt));
      continue;
    }
    // Passive Schritte zuerst anstoßen (Ofen läuft, während man schnippelt), sonst längster Restpfad.
    ready.sort((a, b) => {
      const pa = a.steps[a.next].passive ? 0 : 1;
      const pb = b.steps[b.next].passive ? 0 : 1;
      return pa - pb || remaining(b) - remaining(a);
    });
    const q = ready[0];
    const step = q.steps[q.next];
    const start = cookFreeAt;
    const end = start + step.minutes;
    tasks.push({
      recipeId: q.recipe.id,
      recipeTitle: q.recipe.title,
      stepIndex: q.next,
      text: step.text,
      start,
      end,
      passive: step.passive,
    });
    q.next++;
    q.readyAt = end;
    if (!step.passive) cookFreeAt = end;
  }
  return tasks.sort((a, b) => a.start - b.start || Number(a.passive) - Number(b.passive));
}

export function buildTimelines(plan: PlanData, persons: number, recipes: Map<number, Recipe>): SessionTimeline[] {
  return plan.sessions.map((session) => {
    const sessionPlan = { ...plan, meals: plan.meals.filter((m) => m.session === session.index) };
    const portions = portionsPerRecipe(sessionPlan, persons);
    const entries = [...portions]
      .map(([id, p]) => ({ recipe: recipes.get(id), portions: p }))
      .filter((e): e is { recipe: Recipe; portions: number } => !!e.recipe);

    const tasks = scheduleSession(entries);
    const cookingEnd = tasks.reduce((m, t) => Math.max(m, t.end), 0);
    const totalPortions = entries.reduce((s, e) => s + e.portions, 0);
    const portioning = Math.max(5, Math.round(totalPortions * 1.5));
    if (entries.length) {
      tasks.push({
        recipeId: null,
        recipeTitle: 'Abschluss',
        stepIndex: 0,
        text: `Alles abkühlen lassen, auf ${totalPortions} Boxen verteilen, beschriften und in Kühlschrank bzw. Gefrierfach stellen.`,
        start: cookingEnd,
        end: cookingEnd + portioning,
        passive: false,
      });
    }
    const totalMinutes = cookingEnd + (entries.length ? portioning : 0);
    const activeMinutes = tasks.filter((t) => !t.passive).reduce((s, t) => s + t.end - t.start, 0);

    return {
      session: session.index,
      prepDate: session.prepDate,
      totalMinutes,
      activeMinutes,
      tasks,
      containers: entries.map((e) => ({ recipeId: e.recipe.id, title: e.recipe.title, portions: e.portions })),
    };
  });
}
