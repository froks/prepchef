import Fastify from 'fastify';
import type { AssetSource } from './assets.ts';
import type { Database } from './db.ts';
import { ImportError, importFromUrl } from './domain/importer.ts';
import { summarizeNutrition } from './domain/nutrition.ts';
import { generatePlan, plannedKcalTarget, swapRecipe } from './domain/planner.ts';
import { buildShoppingList } from './domain/shopping.ts';
import { buildTimelines } from './domain/timeline.ts';
import { PlanRepo } from './repo/plans.ts';
import { RecipeRepo } from './repo/recipes.ts';
import { SEED_VERSION, seedRecipes } from './seed/recipes.ts';
import type { MealType, Plan, PlanSettings, Recipe, RecipeInput } from './types.ts';
import { CATEGORIES, DIETS, MEAL_TYPES, PREFERENCES } from './types.ts';

export interface AppOptions {
  db: Database;
  /** Gebautes Frontend, das mit ausgeliefert wird (Verzeichnis oder eingebettet). */
  assets?: AssetSource;
  fetchImpl?: typeof fetch;
  logger?: boolean;
  /** Nur in der Desktop-App gesetzt: „Beenden" in der Oberfläche stoppt dann den Server. */
  onShutdown?: () => void;
}

/** Kennung für /api/health – damit ein zweiter Start erkennt, dass PrepChef schon läuft. */
export const APP_ID = 'prepchef';

const idParams = {
  type: 'object',
  properties: { id: { type: 'integer', minimum: 1 } },
  required: ['id'],
} as const;

const recipeBody = {
  type: 'object',
  required: ['title', 'servings', 'mealTypes', 'diet', 'ingredients', 'steps'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 5000, default: '' },
    servings: { type: 'integer', minimum: 1, maximum: 50 },
    mealTypes: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: MEAL_TYPES } },
    diet: { enum: DIETS },
    tags: { type: 'array', items: { type: 'string', maxLength: 50 }, default: [] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          amount: { type: ['number', 'null'], minimum: 0, default: null },
          unit: { type: 'string', default: '' },
          category: { enum: CATEGORIES, default: 'sonstiges' },
          note: { type: 'string' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 1 },
          minutes: { type: 'integer', minimum: 0, maximum: 1440, default: 5 },
          passive: { type: 'boolean', default: false },
        },
      },
    },
    nutrition: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['kcal', 'protein', 'carbs', 'fat'],
          properties: {
            kcal: { type: 'number', minimum: 0 },
            protein: { type: 'number', minimum: 0 },
            carbs: { type: 'number', minimum: 0 },
            fat: { type: 'number', minimum: 0 },
          },
        },
      ],
      default: null,
    },
    fridgeDays: { type: 'integer', minimum: 0, maximum: 30, default: 3 },
    freezable: { type: 'boolean', default: false },
    favorite: { type: 'boolean', default: false },
    sourceUrl: { type: ['string', 'null'], default: null },
    imageUrl: { type: ['string', 'null'], default: null },
  },
} as const;

const planSettingsBody = {
  type: 'object',
  required: ['weekStart', 'days', 'slots', 'persons', 'diet'],
  properties: {
    weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    days: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 6 } },
    slots: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: MEAL_TYPES } },
    persons: { type: 'integer', minimum: 1, maximum: 20 },
    kcalTarget: { type: ['integer', 'null'], minimum: 800, maximum: 6000, default: null },
    diet: { enum: DIETS },
    prepSessions: { enum: [1, 2], default: 1 },
    recipesPerSlot: { type: 'integer', minimum: 1, maximum: 7, default: 2 },
    excludeIngredients: { type: 'array', items: { type: 'string' }, default: [] },
    preferences: { type: 'array', uniqueItems: true, items: { enum: PREFERENCES }, default: [] },
  },
} as const;

/**
 * Liefert neue Grundrezepte nach. Die Version steht in `PRAGMA user_version`, damit Rezepte,
 * die jemand gelöscht hat, beim nächsten Start nicht wieder auftauchen.
 */
function applySeeds(db: Database, recipes: RecipeRepo) {
  const stored = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  // Datenbanken von vor der Versionierung haben den ersten Satz schon bekommen.
  const applied = stored === 0 && recipes.count() > 0 ? 1 : stored;
  if (applied >= SEED_VERSION) return;
  const existing = new Set(recipes.list().map((r) => r.title.toLowerCase()));
  for (const r of seedRecipes(applied)) if (!existing.has(r.title.toLowerCase())) recipes.create(r);
  db.exec(`PRAGMA user_version = ${SEED_VERSION}`);
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false });
  const recipes = new RecipeRepo(opts.db);
  const plans = new PlanRepo(opts.db);

  applySeeds(opts.db, recipes);

  /** Plan inklusive aller abgeleiteten Ansichten. */
  function expandPlan(plan: Plan) {
    const all = new Map<number, Recipe>(recipes.list().map((r) => [r.id, r]));
    const used = new Map<number, Recipe>();
    for (const m of plan.data.meals) {
      const r = m.recipeId != null ? all.get(m.recipeId) : undefined;
      if (r) used.set(r.id, r);
    }
    return {
      ...plan,
      recipes: Object.fromEntries(used),
      shopping: buildShoppingList(plan.data, plan.settings.persons, used),
      timelines: buildTimelines(plan.data, plan.settings.persons, used),
      nutrition: summarizeNutrition(plan.data, used, plannedKcalTarget(plan.settings), plan.settings.kcalTarget),
    };
  }

  app.setErrorHandler((err: any, _req, reply) => {
    if (err.validation) return reply.code(400).send({ error: `Ungültige Eingabe: ${err.message}` });
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: err.statusCode ? err.message : 'Interner Fehler' });
  });

  // --- Rezepte ---

  app.get('/api/recipes', async () => recipes.list());

  app.get<{ Params: { id: number } }>('/api/recipes/:id', { schema: { params: idParams } }, async (req, reply) => {
    return recipes.get(req.params.id) ?? reply.code(404).send({ error: 'Rezept nicht gefunden' });
  });

  app.post<{ Body: RecipeInput }>('/api/recipes', { schema: { body: recipeBody } }, async (req, reply) => {
    return reply.code(201).send(recipes.create(req.body));
  });

  app.put<{ Params: { id: number }; Body: RecipeInput }>(
    '/api/recipes/:id',
    { schema: { params: idParams, body: recipeBody } },
    async (req, reply) => recipes.update(req.params.id, req.body) ?? reply.code(404).send({ error: 'Rezept nicht gefunden' }),
  );

  app.patch<{ Params: { id: number }; Body: { favorite: boolean } }>(
    '/api/recipes/:id/favorite',
    {
      schema: {
        params: idParams,
        body: { type: 'object', required: ['favorite'], properties: { favorite: { type: 'boolean' } } },
      },
    },
    async (req, reply) =>
      recipes.setFavorite(req.params.id, req.body.favorite) ?? reply.code(404).send({ error: 'Rezept nicht gefunden' }),
  );

  app.delete<{ Params: { id: number } }>('/api/recipes/:id', { schema: { params: idParams } }, async (req, reply) => {
    return recipes.delete(req.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'Rezept nicht gefunden' });
  });

  app.post<{ Body: { url: string } }>(
    '/api/import',
    { schema: { body: { type: 'object', required: ['url'], properties: { url: { type: 'string', minLength: 1 } } } } },
    async (req, reply) => {
      try {
        return await importFromUrl(req.body.url, opts.fetchImpl);
      } catch (err) {
        if (err instanceof ImportError) return reply.code(422).send({ error: err.message });
        throw err;
      }
    },
  );

  // --- Pläne ---

  app.get('/api/plans', async () =>
    plans.list().map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      settings: p.settings,
      mealCount: p.data.meals.filter((m) => m.recipeId != null).length,
      recipeCount: new Set(p.data.meals.map((m) => m.recipeId).filter((id) => id != null)).size,
    })),
  );

  app.get<{ Params: { id: number } }>('/api/plans/:id', { schema: { params: idParams } }, async (req, reply) => {
    const plan = plans.get(req.params.id);
    return plan ? expandPlan(plan) : reply.code(404).send({ error: 'Plan nicht gefunden' });
  });

  app.post<{ Body: PlanSettings }>('/api/plans', { schema: { body: planSettingsBody } }, async (req, reply) => {
    // Die Tage 0–6 zählen ab weekStart – das muss also ein Montag sein.
    const weekday = new Date(`${req.body.weekStart}T12:00:00Z`).getUTCDay();
    if (Number.isNaN(weekday)) return reply.code(400).send({ error: 'Ungültiges Datum.' });
    if (weekday !== 1) return reply.code(400).send({ error: 'Die Woche muss an einem Montag beginnen.' });
    const data = generatePlan(req.body, recipes.list(), { recentlyUsed: plans.recentRecipeIds() });
    return reply.code(201).send(expandPlan(plans.create(req.body, data)));
  });

  app.post<{ Params: { id: number }; Body: { session: number; slot: MealType; recipeId: number } }>(
    '/api/plans/:id/swap',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['session', 'slot', 'recipeId'],
          properties: {
            session: { type: 'integer', minimum: 0 },
            slot: { enum: MEAL_TYPES },
            recipeId: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const plan = plans.get(req.params.id);
      if (!plan) return reply.code(404).send({ error: 'Plan nicht gefunden' });
      const data = swapRecipe(plan.data, plan.settings, recipes.list(), req.body);
      return expandPlan(plans.updateData(plan.id, data)!);
    },
  );

  app.put<{ Params: { id: number }; Body: { checked: string[] } }>(
    '/api/plans/:id/checked',
    {
      schema: {
        params: idParams,
        body: { type: 'object', required: ['checked'], properties: { checked: { type: 'array', items: { type: 'string' } } } },
      },
    },
    async (req, reply) => {
      const plan = plans.setChecked(req.params.id, req.body.checked);
      return plan ? { checked: plan.checked } : reply.code(404).send({ error: 'Plan nicht gefunden' });
    },
  );

  app.delete<{ Params: { id: number } }>('/api/plans/:id', { schema: { params: idParams } }, async (req, reply) => {
    return plans.delete(req.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'Plan nicht gefunden' });
  });

  app.get('/api/health', async () => ({ app: APP_ID, canShutdown: !!opts.onShutdown }));

  if (opts.onShutdown) {
    const shutdown = opts.onShutdown;
    app.post('/api/shutdown', async (_req, reply) => {
      await reply.send({ ok: true });
      setTimeout(shutdown, 100);
    });
  }

  const assets = opts.assets;
  if (assets) {
    app.setNotFoundHandler(async (req, reply) => {
      const path = req.url.split('?')[0];
      if (req.method !== 'GET' || path.startsWith('/api/')) return reply.code(404).send({ error: 'Nicht gefunden' });
      const file = (path !== '/' && (await assets(path))) || null;
      if (file) {
        // Vite hängt Hashes an die Dateinamen unter /assets/ – die dürfen dauerhaft gecacht werden.
        if (path.startsWith('/assets/')) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        return reply.type(file.type).send(Buffer.from(file.body));
      }
      // Client-seitiges Routing: unbekannte Pfade liefern die SPA aus.
      const index = await assets('/index.html');
      if (!index) return reply.code(404).send({ error: 'Frontend nicht gebaut – bitte `bun run build` ausführen.' });
      return reply.header('Cache-Control', 'no-cache').type(index.type).send(Buffer.from(index.body));
    });
  }

  return app;
}
