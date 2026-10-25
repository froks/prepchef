/** Kanonische Einheit für jede bekannte Schreibweise (Kleinbuchstaben, ohne Punkt). */
const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gramm: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogramm: 'kg',
  mg: 'mg',
  ml: 'ml',
  milliliter: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  el: 'EL',
  esslöffel: 'EL',
  tl: 'TL',
  teelöffel: 'TL',
  msp: 'Msp.',
  messerspitze: 'Msp.',
  prise: 'Prise',
  prisen: 'Prise',
  stück: 'Stück',
  stk: 'Stück',
  st: 'Stück',
  bund: 'Bund',
  dose: 'Dose',
  dosen: 'Dose',
  pck: 'Pck.',
  packung: 'Pck.',
  packungen: 'Pck.',
  päckchen: 'Pck.',
  becher: 'Becher',
  glas: 'Glas',
  gläser: 'Glas',
  zehe: 'Zehe',
  zehen: 'Zehe',
  scheibe: 'Scheibe',
  scheiben: 'Scheibe',
  handvoll: 'Handvoll',
  tasse: 'Tasse',
  tassen: 'Tasse',
  zweig: 'Zweig',
  zweige: 'Zweig',
  stange: 'Stange',
  stangen: 'Stange',
  würfel: 'Würfel',
  knolle: 'Knolle',
  knollen: 'Knolle',
  kopf: 'Kopf',
  köpfe: 'Kopf',
  schuss: 'Schuss',
};

export function canonicalUnit(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] ?? null;
}

/** Umrechnung in eine Basiseinheit, damit z. B. 500 g und 1 kg addiert werden können. */
const TO_BASE: Record<string, { base: string; factor: number }> = {
  mg: { base: 'g', factor: 0.001 },
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
  EL: { base: 'TL', factor: 3 },
};

export function toBase(amount: number, unit: string): { amount: number; unit: string } {
  const conv = TO_BASE[unit];
  return conv ? { amount: amount * conv.factor, unit: conv.base } : { amount, unit };
}

/** Lesbare Darstellung einer Menge in Basiseinheit (1500 g → 1,5 kg). */
export function humanize(amount: number, unit: string): { amount: number; unit: string } {
  if (unit === 'g' && amount >= 1000) return { amount: round(amount / 1000, 2), unit: 'kg' };
  if (unit === 'ml' && amount >= 1000) return { amount: round(amount / 1000, 2), unit: 'l' };
  if (unit === 'g' || unit === 'ml') return { amount: roundGrams(amount), unit };
  // Löffel: ganze Esslöffel lesen sich besser als 6 TL.
  if (unit === 'TL' && amount >= 3 && Math.abs(amount / 3 - Math.round(amount / 3)) < 1e-6) return { amount: Math.round(amount / 3), unit: 'EL' };
  // Zählbare Einheiten aufrunden – eine halbe Dose kauft man nicht.
  if (['Stück', 'Dose', 'Pck.', 'Becher', 'Glas', 'Bund', 'Knolle', 'Kopf', 'Stange', 'Zehe', 'Würfel', 'Scheibe'].includes(unit) || unit === '') {
    return { amount: Math.ceil(amount - 1e-9), unit };
  }
  return { amount: round(amount, 1), unit };
}

function roundGrams(amount: number): number {
  if (amount < 20) return Math.round(amount);
  if (amount < 200) return Math.round(amount / 5) * 5;
  return Math.round(amount / 10) * 10;
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
