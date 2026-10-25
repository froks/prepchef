import type { MealType, Nutrition, RecipeInput, Step } from '../types.ts';
import { guessDiet, parseIngredient } from './ingredients.ts';

export class ImportError extends Error {}

/**
 * Lädt eine Rezeptseite und liest die schema.org/Recipe-Daten (JSON-LD) aus.
 * Das Ergebnis ist ein Entwurf, den die Nutzerin/der Nutzer vor dem Speichern prüft.
 */
export async function importFromUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<RecipeInput> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImportError('Ungültige URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ImportError('Nur http- und https-Links werden unterstützt.');
  }

  let html: string;
  try {
    const res = await fetchImpl(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) PrepChef/0.1 (Rezeptimport)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new ImportError(`Die Seite antwortete mit Status ${res.status}.`);
    html = await res.text();
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(`Die Seite konnte nicht geladen werden: ${(err as Error).message}`);
  }

  const recipe = extractRecipe(html);
  if (!recipe) {
    throw new ImportError('Auf der Seite wurden keine strukturierten Rezeptdaten (schema.org/Recipe) gefunden.');
  }
  return mapRecipe(recipe, parsed.toString());
}

type Json = any;

export function extractRecipe(html: string): Json | null {
  const re = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data: Json;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      // Manche Seiten haben Steuerzeichen in Strings.
      try {
        data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const found = findRecipe(data);
    if (found) return found;
  }
  return null;
}

function findRecipe(node: Json): Json | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findRecipe(n);
      if (f) return f;
    }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipe(node['@graph']);
  if (node.mainEntity) return findRecipe(node.mainEntity);
  return null;
}

export function mapRecipe(r: Json, sourceUrl: string): RecipeInput {
  const ingredients = toArray(r.recipeIngredient ?? r.ingredients)
    .map((s) => decodeEntities(String(s)).trim())
    .filter(Boolean)
    .map(parseIngredient);

  const totalMinutes = parseDuration(r.totalTime) || parseDuration(r.prepTime) + parseDuration(r.cookTime);
  const steps = distributeTime(mergeTips(flattenInstructions(r.recipeInstructions).map((t) => decodeEntities(t))), totalMinutes);

  const keywords = [...toArray(r.keywords), ...toArray(r.recipeCategory), ...toArray(r.recipeCuisine)]
    .flatMap((k) => String(k).split(','))
    .map((k) => decodeEntities(k).trim())
    .filter(Boolean);
  const tags = [...new Set(keywords.map((k) => k.toLowerCase()))].slice(0, 12);

  return {
    title: decodeEntities(String(r.name ?? 'Importiertes Rezept')).trim(),
    description: decodeEntities(stripTags(String(r.description ?? ''))).trim(),
    servings: parseYield(r.recipeYield),
    mealTypes: guessMealTypes(tags),
    diet: guessDiet(ingredients),
    tags,
    ingredients,
    steps,
    nutrition: parseNutrition(r.nutrition),
    fridgeDays: 3,
    freezable: false,
    favorite: false,
    sourceUrl,
    imageUrl: parseImage(r.image),
  };
}

function toArray(v: Json): Json[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function flattenInstructions(v: Json): string[] {
  if (v == null) return [];
  if (typeof v === 'string') {
    return stripTags(v)
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(flattenInstructions);
  if (typeof v === 'object') {
    if (v.itemListElement) return flattenInstructions(v.itemListElement);
    if (v.text) return flattenInstructions(String(v.text));
    if (v.name) return flattenInstructions(String(v.name));
  }
  return [];
}

/** „Tipp: …"-Absätze sind keine Arbeitsschritte – sie werden an den vorherigen Schritt angehängt. */
function mergeTips(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    if (out.length && /^(tipp|hinweis|info|tip|note)\s*:/i.test(t)) out[out.length - 1] += ` (${t})`;
    else out.push(t);
  }
  return out;
}

/** ISO-8601-Dauer (PT1H30M) in Minuten. */
export function parseDuration(v: Json): number {
  if (typeof v !== 'string') return 0;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 0;
  return Math.round(Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60);
}

function parseYield(v: Json): number {
  for (const item of toArray(v)) {
    const n = typeof item === 'number' ? item : Number.parseInt(String(item).match(/\d+/)?.[0] ?? '', 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 50);
  }
  return 4;
}

function parseNutrition(n: Json): Nutrition | null {
  if (!n || typeof n !== 'object') return null;
  const num = (v: Json) => {
    const m = String(v ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  let kcal = num(n.calories);
  // Manche Seiten geben kJ an.
  if (kcal != null && /kj/i.test(String(n.calories)) && !/kcal/i.test(String(n.calories))) kcal = kcal / 4.184;
  if (kcal == null) return null;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(num(n.proteinContent) ?? 0),
    carbs: Math.round(num(n.carbohydrateContent) ?? 0),
    fat: Math.round(num(n.fatContent) ?? 0),
  };
}

function parseImage(v: Json): string | null {
  const first = toArray(v)[0];
  if (!first) return null;
  if (typeof first === 'string') return first;
  return typeof first.url === 'string' ? first.url : null;
}

function guessMealTypes(tags: string[]): MealType[] {
  const t = tags.join(' ');
  if (/frühstück|breakfast|brunch|porridge|müsli/.test(t)) return ['fruehstueck'];
  if (/snack|dessert|kuchen|gebäck|süßspeise|fingerfood/.test(t)) return ['snack'];
  return ['mittag', 'abend'];
}

const PASSIVE_RE =
  /\b(backen|im ofen|in den ofen|garen lassen|köcheln|schmoren|ziehen lassen|ruhen lassen|abkühlen|quellen|marinieren|einweichen|gehen lassen|simmer|bake|roast|rest)\b/i;

export function estimateStep(text: string): Step {
  const m = text.replace(/\((tipp|hinweis|info|tip|note)\s*:.*\)$/i, '').match(/(\d+)(?:\s*(?:-|–|bis)\s*(\d+))?\s*(min|minuten|minute|std|stunden|stunde|h)\b/i);
  let minutes = 0;
  if (m) {
    const value = Number(m[2] ?? m[1]);
    minutes = /^(std|stunde|stunden|h)$/i.test(m[3]) ? value * 60 : value;
  }
  return { text, minutes, passive: PASSIVE_RE.test(text) };
}

/** Verteilt die Gesamtzeit auf Schritte ohne erkennbare Zeitangabe. */
function distributeTime(texts: string[], totalMinutes: number): Step[] {
  const steps = texts.map(estimateStep);
  const known = steps.reduce((s, st) => s + st.minutes, 0);
  const unknown = steps.filter((s) => s.minutes === 0);
  if (unknown.length) {
    const share = Math.max(3, Math.round(Math.max(0, totalMinutes - known) / unknown.length) || 5);
    for (const s of unknown) s.minutes = share;
  }
  return steps;
}

function stripTags(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
  ndash: '–',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[e] ?? whole;
  });
}
