#!/usr/bin/env bun
/**
 * Erzeugt die Screenshots für die README unter docs/screenshots/.
 *
 *   bun run screenshots
 *
 * Startet PrepChef mit einer Datenbank im Arbeitsspeicher und festem Zufallswert (immer derselbe Demo-Plan)
 * und steuert Chromium über das DevTools-Protokoll – so lassen sich Dunkelmodus und Sprache zuverlässig setzen.
 * Browser per CHROME=/pfad/zum/browser wählbar.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildApp } from '../server/src/app.ts';
import { directoryAssets } from '../server/src/assets.ts';
import { openDatabase } from '../server/src/db.ts';

const root = join(import.meta.dir, '..');
const outDir = join(root, 'docs', 'screenshots');

interface Shot {
  name: string;
  path: string;
  width: number;
  height: number;
  /** Standard ist der Dunkelmodus; `light` zeigt zum Vergleich den hellen. */
  light?: boolean;
  mobile?: boolean;
}

// Deterministischer Zufall (mulberry32), damit der Demo-Plan bei jedem Lauf gleich aussieht.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('▸ Frontend bauen …');
await $`bun run --filter @prepchef/client build`.cwd(root).quiet();

const app = await buildApp({ db: openDatabase(':memory:'), assets: directoryAssets(join(root, 'client', 'dist')) });
await app.listen({ port: 0, host: '127.0.0.1' });
const address = app.server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

// Demo-Daten: ein paar Favoriten und ein Wochenplan.
const recipes = (await (await fetch(`${base}/api/recipes`)).json()) as { id: number; title: string }[];
const idOf = (title: string) => recipes.find((r) => r.title === title)!.id;
for (const title of ['Rotes Linsen-Dal', 'Hähnchen-Curry mit Reis', 'Overnight Oats mit Beeren']) {
  await fetch(`${base}/api/recipes/${idOf(title)}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite: true }),
  });
}
Math.random = seeded(Number(process.env.SCREENSHOT_SEED ?? 2));
const plan = (await (
  await fetch(`${base}/api/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weekStart: '2026-10-26',
      days: [0, 1, 2, 3, 4],
      slots: ['fruehstueck', 'mittag', 'abend'],
      persons: 2,
      kcalTarget: 2000,
      diet: 'alles',
      prepSessions: 1,
      recipesPerSlot: 2,
      preferences: ['wenigAufwand'],
    }),
  })
).json()) as { id: number };

const SHOTS: Shot[] = [
  { name: 'planer', path: '/', width: 1280, height: 1180 },
  { name: 'woche', path: `/plaene/${plan.id}`, width: 1280, height: 780 },
  { name: 'einkaufsliste', path: `/plaene/${plan.id}?tab=einkauf`, width: 1280, height: 960 },
  { name: 'prep-ablauf', path: `/plaene/${plan.id}?tab=ablauf`, width: 1280, height: 1100 },
  { name: 'naehrwerte', path: `/plaene/${plan.id}?tab=naehrwerte`, width: 1280, height: 720 },
  { name: 'rezepte', path: '/rezepte', width: 1280, height: 980 },
  { name: 'rezept', path: `/rezepte/${idOf('Hähnchen-Curry mit Reis')}`, width: 1280, height: 1000 },
  { name: 'hell', path: `/plaene/${plan.id}?tab=ablauf`, width: 1280, height: 760, light: true },
  { name: 'mobil', path: `/plaene/${plan.id}?tab=einkauf`, width: 390, height: 844, mobile: true },
];

// --- Chromium über das DevTools-Protokoll steuern ---

async function findBrowser(): Promise<string> {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const path = Bun.which(name);
    if (path) return path;
  }
  throw new Error('Kein Chromium/Chrome gefunden – Pfad per CHROME=… angeben.');
}

// Snap-Chromium darf nur unter ~/snap/chromium schreiben, deshalb das Profil dort anlegen, falls vorhanden.
const profileBase = (await Bun.file(join(homedir(), 'snap', 'chromium')).exists()) ? join(homedir(), 'snap', 'chromium', 'common') : undefined;
const profile = await mkdtemp(join(profileBase ?? tmpdir(), 'prepchef-shots-'));
const port = 9300 + Math.floor(Math.random() * 500);
const browser = Bun.spawn(
  [await findBrowser(), '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdout: 'ignore', stderr: 'ignore' },
);

let pageWs = '';
for (let i = 0; i < 50 && !pageWs; i++) {
  try {
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    pageWs = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch {
    await Bun.sleep(200);
  }
}
if (!pageWs) throw new Error('Chromium startet nicht.');

const ws = new WebSocket(pageWs);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let nextId = 1;
const pending = new Map<number, (result: any) => void>();
const listeners = new Set<(method: string) => void>();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result);
    pending.delete(msg.id);
  } else if (msg.method) for (const l of listeners) l(msg.method);
});
function send(method: string, params: object = {}): Promise<any> {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
function waitFor(event: string): Promise<void> {
  return new Promise((resolve) => {
    const l = (m: string) => m === event && (listeners.delete(l), resolve());
    listeners.add(l);
  });
}

await send('Page.enable');
await send('Emulation.setLocaleOverride', { locale: 'de-DE' });
await send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' });
await mkdir(outDir, { recursive: true });

for (const shot of SHOTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: shot.mobile ? 2 : 1,
    mobile: !!shot.mobile,
  });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.light ? 'light' : 'dark' }] });
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: base + shot.path });
  await loaded;
  await Bun.sleep(700); // Daten laden und rendern lassen
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(outDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
  console.log(`  ✓ docs/screenshots/${shot.name}.png`);
}

ws.close();
browser.kill();
await browser.exited;
await rm(profile, { recursive: true, force: true });
await app.close();
console.log('✓ Fertig');
