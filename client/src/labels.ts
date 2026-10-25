import { LOW_CARB_MAX_GRAMS, LOW_EFFORT_MAX_MINUTES, QUICK_MAX_MINUTES } from '../../server/src/domain/traits.ts';
import type { Category, Diet, MealType, Preference } from './api.ts';

export const PREFERENCE_LABEL: Record<Preference, string> = {
  schnell: 'Schnell fertig',
  wenigAufwand: 'Wenig Aufwand',
  lowcarb: 'Low Carb',
};

export const PREFERENCE_ICON: Record<Preference, string> = {
  schnell: '⚡',
  wenigAufwand: '🔪',
  lowcarb: '🥗',
};

export const PREFERENCE_HINT: Record<Preference, string> = {
  schnell: `höchstens ${QUICK_MAX_MINUTES} Min. Gesamtzeit`,
  wenigAufwand: `höchstens ${LOW_EFFORT_MAX_MINUTES} Min. aktive Zeit`,
  lowcarb: `höchstens ${LOW_CARB_MAX_GRAMS} g Kohlenhydrate pro Portion`,
};

export const MEAL_LABEL: Record<MealType, string> = {
  fruehstueck: 'Frühstück',
  mittag: 'Mittagessen',
  abend: 'Abendessen',
  snack: 'Snack',
};

export const DIET_LABEL: Record<Diet, string> = {
  vegan: 'Vegan',
  vegetarisch: 'Vegetarisch',
  pescetarisch: 'Pescetarisch',
  alles: 'Mit Fleisch',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  'obst-gemuese': 'Obst & Gemüse',
  'fleisch-fisch': 'Fleisch & Fisch',
  'milch-kuehl': 'Milchprodukte & Kühlregal',
  'brot-backwaren': 'Brot & Backwaren',
  trockenwaren: 'Nudeln, Reis & Trockenwaren',
  konserven: 'Konserven & Gläser',
  'gewuerze-oele': 'Gewürze, Öle & Saucen',
  tiefkuehl: 'Tiefkühl',
  getraenke: 'Getränke',
  sonstiges: 'Sonstiges',
};

export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T12:00:00`));
}

export function formatShortDate(iso: string): string {
  return shortFmt.format(new Date(`${iso}T12:00:00`));
}

export function formatAmount(amount: number | null, unit: string): string {
  if (amount == null) return '';
  const n = amount.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Uhrzeit relativ zu einem Startzeitpunkt (z. B. 10:00 + 75 min → 11:15). */
export function clock(startHour: number, minutes: number): string {
  const total = startHour * 60 + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Datum immer im deutschen Format TT.MM.JJJJ – unabhängig von der Sprache des Browsers. */
export function formatNumericDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Montag der Woche, in der `from` liegt. */
export function mondayOf(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIso(d);
}

/** Montag der nächsten Woche – sonntags also der morgige Tag, passend zum Kochtag am Sonntag. */
export function nextMonday(from = new Date()): string {
  return addDaysIso(mondayOf(from), 7);
}

/** Kalenderwoche nach ISO 8601 (wie in deutschen Kalendern). */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Donnerstag derselben Woche
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** „KW 44 · 26.10.2026 – 01.11.2026" */
export function formatWeek(monday: string): string {
  return `KW ${isoWeek(monday)} · ${formatNumericDate(monday)} – ${formatNumericDate(addDaysIso(monday, 6))}`;
}
