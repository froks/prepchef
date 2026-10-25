import type { Category, Diet, Ingredient } from '../types.ts';
import { canonicalUnit } from './units.ts';

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
};

// Reihenfolge wichtig: die erste passende Alternative gewinnt.
const NUMBER = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[½⅓⅔¼¾⅛])?|[½⅓⅔¼¾⅛])`;
const AMOUNT_RE = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|bis)\s*(${NUMBER}))?\s*`);

function parseNumber(raw: string): number {
  const s = raw.replace(/\s+/g, ' ').trim();
  let m = s.match(/^(\d+) (\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([½⅓⅔¼¾⅛])?$/);
  if (m) return (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? UNICODE_FRACTIONS[m[2]] : 0);
  return Number.NaN;
}

/**
 * Zerlegt eine Zutatenzeile wie „1 ½ EL Olivenöl, nativ" oder „2-3 Zwiebel(n)".
 * Bei Spannen wird der größere Wert genommen, damit die Einkaufsliste reicht.
 */
export function parseIngredient(line: string): Ingredient {
  let rest = line
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(etwas|evtl\.?|eventuell|n\. ?b\.)\s+/i, '')
    .replace(/,?\s*(nach belieben|nach geschmack|n\. ?b\.)$/i, '');
  let amount: number | null = null;
  let unit = '';

  const am = rest.match(AMOUNT_RE);
  if (am) {
    const value = parseNumber(am[2] ?? am[1]);
    if (!Number.isNaN(value)) {
      amount = value;
      rest = rest.slice(am[0].length);
    }
  }

  const um = rest.match(/^([A-Za-zÄÖÜäöüß]+\.?)(?:\s+|$)/);
  if (um) {
    const unitCandidate = canonicalUnit(um[1]);
    // „Zehe" o. ä. ohne folgenden Namen ist der Name selbst, keine Einheit.
    if (unitCandidate && rest.length > um[0].length) {
      unit = unitCandidate;
      rest = rest.slice(um[0].length);
    }
  }

  let note: string | undefined;
  const notes: string[] = [];
  rest = rest.replace(/\s*\(([^)]*)\)/g, (_, inner: string) => {
    // „Zwiebel(n)" ist eine Pluralmarkierung, keine Anmerkung.
    if (!/^(n|en|s|e|er)$/i.test(inner.trim())) notes.push(inner.trim());
    return '';
  });
  const comma = rest.indexOf(',');
  if (comma >= 0) {
    notes.unshift(rest.slice(comma + 1).trim());
    rest = rest.slice(0, comma);
  }
  if (notes.length) note = notes.filter(Boolean).join(', ') || undefined;

  const name = rest.trim() || line.trim();
  return { name, amount, unit, category: categoryFor(name, unit, note), ...(note ? { note } : {}) };
}

/** Anmerkungen wie „(TK)" oder „aus der Dose" zählen nur, wenn sie die Zutat eindeutig beschreiben – nicht bei „oder TK". */
function categoryFor(name: string, unit: string, note: string | undefined): Category {
  if (unit === 'Dose' || /^(aus der )?dose\b/i.test(note ?? '')) return 'konserven';
  if (/^(tk|tiefgekühlt|gefroren)\b/i.test(note ?? '')) return 'tiefkuehl';
  return guessCategory(name);
}

/** Zusammengesetzte Wörter, die sonst in der falschen Kategorie landen („Zuckerschoten" ≠ Zucker). */
const CATEGORY_OVERRIDES: [string, Category][] = [
  ['olivenöl', 'gewuerze-oele'],
  ['zitronensaft', 'obst-gemuese'],
  ['limettensaft', 'obst-gemuese'],
  ['brühe', 'gewuerze-oele'],
  ['fond', 'gewuerze-oele'],
  ['erdnussbutter', 'trockenwaren'],
  ['zuckerschote', 'obst-gemuese'],
  ['haferdrink', 'milch-kuehl'],
  ['sojadrink', 'milch-kuehl'],
  ['hefeflocken', 'trockenwaren'],
  ['saft', 'getraenke'],
];

const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ['tiefkuehl', ['tiefkühl', 'tk', 'gefroren']],
  [
    'konserven',
    ['dose', 'gehackte tomaten', 'stückige tomaten', 'passierte tomaten', 'tomatenmark', 'kokosmilch', 'mais', 'kidneybohnen', 'kichererbsen', 'weiße bohnen', 'schwarze bohnen', 'pesto', 'oliven', 'kapern', 'salsa'],
  ],
  [
    'fleisch-fisch',
    ['hähnchen', 'huhn', 'hühner', 'pute', 'puten', 'rind', 'schwein', 'hackfleisch', 'hackbällchen', 'rinderhack', 'schweinehack', 'speck', 'schinken', 'wurst', 'würstchen', 'wiener', 'bacon', 'frikadelle', 'ente', 'lachs', 'thunfisch', 'fisch', 'garnele', 'shrimp', 'lamm', 'chorizo', 'salami', 'kabeljau', 'filet'],
  ],
  [
    'milch-kuehl',
    ['milch', 'joghurt', 'quark', 'sahne', 'käse', 'feta', 'mozzarella', 'parmesan', 'butter', 'ei', 'eier', 'skyr', 'frischkäse', 'schmand', 'crème', 'creme', 'tofu', 'tempeh', 'hefe', 'cheddar', 'gouda', 'emmentaler', 'ricotta', 'mascarpone', 'halloumi', 'teig'],
  ],
  ['getraenke', ['wein', 'bier', 'mineralwasser']],
  ['brot-backwaren', ['brot', 'brötchen', 'toast', 'wrap', 'tortilla', 'fladenbrot', 'baguette', 'pita']],
  [
    'gewuerze-oele',
    ['salz', 'pfeffer', 'öl', 'essig', 'paprikapulver', 'curry', 'kreuzkümmel', 'kurkuma', 'zimt', 'chili', 'oregano', 'thymian', 'basilikum getrocknet', 'gewürz', 'brühe', 'senf', 'sojasauce', 'sojasoße', 'honig', 'sirup', 'zucker', 'garam masala', 'muskat', 'lorbeer', 'ingwerpulver', 'knoblauchpulver', 'sesam', 'tahin', 'erdnussbutter', 'vanille', 'backpulver', 'natron', 'kümmel', 'majoran'],
  ],
  [
    'trockenwaren',
    ['nudel', 'spaghetti', 'penne', 'fusilli', 'pasta', 'reis', 'quinoa', 'couscous', 'bulgur', 'linsen', 'haferflocken', 'mehl', 'grieß', 'nüsse', 'mandeln', 'cashew', 'walnüsse', 'erdnüsse', 'chiasamen', 'leinsamen', 'datteln', 'rosinen', 'kakao', 'polenta', 'hirse', 'glasnudeln', 'mie', 'lasagneplatte', 'semmelbrösel', 'kerne', 'kokosraspeln', 'stärke', 'schokolade'],
  ],
  [
    'obst-gemuese',
    ['zwiebel', 'knoblauch', 'tomate', 'paprika', 'karotte', 'möhre', 'kartoffel', 'süßkartoffel', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'spinat', 'salat', 'gurke', 'lauch', 'porree', 'sellerie', 'kürbis', 'pilz', 'champignon', 'ingwer', 'zitrone', 'limette', 'apfel', 'banane', 'beeren', 'avocado', 'petersilie', 'koriander', 'basilikum', 'schnittlauch', 'minze', 'frühlingszwiebel', 'erbsen', 'bohnen', 'kohl', 'rote bete', 'mango', 'orange', 'birne', 'radieschen', 'rucola', 'edamame', 'äpfel', 'dill', 'rosmarin', 'salbei', 'kräuter'],
  ],
];

const NON_LETTER = '[^a-zäöüß]';

/**
 * Kurze Wörter („ei", „tk") zählen nur als ganzes Wort, sonst trifft „ei" auf „Weizen".
 * „öl" darf zusätzlich Wortende sein („Olivenöl").
 */
function matchesKeyword(text: string, word: string): boolean {
  if (word.length > 3 || !/^[a-zäöüß]+$/.test(word)) return text.includes(word);
  const prefix = word === 'öl' ? '' : `(^|${NON_LETTER})`;
  return new RegExp(`${prefix}${word}(${NON_LETTER}|$)`).test(text);
}

export function guessCategory(name: string): Category {
  const n = ` ${name.toLowerCase()} `;
  for (const [word, category] of CATEGORY_OVERRIDES) if (n.includes(word)) return category;
  for (const [category, words] of CATEGORY_KEYWORDS) {
    for (const w of words) {
      if (matchesKeyword(n, w)) return category;
    }
  }
  return 'sonstiges';
}

/** Schlüssel zum Zusammenfassen: „Zwiebeln" und „Zwiebel" landen auf derselben Zeile. */
export function ingredientKey(name: string): string {
  let k = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zäöüß ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (k === 'eier') k = 'ei';
  if (k.length > 4 && k.endsWith('n')) k = k.slice(0, -1);
  return k;
}

/** Zutaten, die (fast) jede Küche hat – zählen nicht als „gemeinsame Zutat" bei der Planung. */
const STAPLES = ['salz', 'pfeffer', 'wasser', 'öl', 'olivenöl', 'rapsöl', 'zucker', 'sonnenblumenöl', 'pflanzenöl'];

export function isStaple(name: string): boolean {
  const k = ingredientKey(name);
  return STAPLES.some((s) => k === s || k.startsWith(`${s} `) || k.endsWith(` ${s}`));
}

// Nicht nur „hack" – das träfe auch „gehackte Tomaten".
const MEAT = ['hähnchen', 'huhn', 'hühner', 'pute', 'rind', 'schwein', 'hackfleisch', 'hackbällchen', 'rinderhack', 'schweinehack', 'speck', 'schinken', 'wurst', 'würstchen', 'wiener', 'bacon', 'frikadelle', 'lamm', 'chorizo', 'salami', 'gelatine', 'kalb', 'ente', 'gans'];
const FISH = ['lachs', 'thunfisch', 'fisch', 'garnele', 'shrimp', 'kabeljau', 'sardelle', 'forelle'];
const ANIMAL = ['milch', 'joghurt', 'quark', 'sahne', 'käse', 'feta', 'mozzarella', 'parmesan', 'butter', 'skyr', 'schmand', 'honig', 'crème fraîche', 'frischkäse', 'cheddar', 'gouda', 'emmentaler', 'ricotta', 'mascarpone', 'halloumi'];
const PLANT_EXCEPTIONS = ['kokosmilch', 'hafermilch', 'sojamilch', 'mandelmilch', 'sojajoghurt', 'pflanzlich', 'vegan', 'erdnussbutter', 'kakaobutter'];

/** Leitet die Ernährungsform aus den Zutaten ab (für importierte Rezepte). */
export function guessDiet(ingredients: Ingredient[]): Diet {
  const names = ingredients.map((i) => i.name.toLowerCase());
  const has = (words: string[]) =>
    names.some((n) => !PLANT_EXCEPTIONS.some((p) => n.includes(p)) && words.some((w) => n.includes(w)));
  if (has(MEAT)) return 'alles';
  if (has(FISH)) return 'pescetarisch';
  if (has(ANIMAL) || names.some((n) => /(^|\s)eie?r?(\s|$)/.test(n))) return 'vegetarisch';
  return 'vegan';
}
