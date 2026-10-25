#!/usr/bin/env bun
/**
 * Startet die kompilierte App mit leerem Datenordner und prüft sie – läuft auf Linux, macOS und Windows.
 *
 *   bun scripts/smoke-test.ts [datei]            Server-Modus: Frontend, API, Plan, Beenden
 *   bun scripts/smoke-test.ts [datei] --window   App-Fenster: öffnet sich, rendert die Oberfläche, schließt sich
 *
 * Standard-Datei: dist/prepchef(.exe). Unter Linux braucht --window ein Display (z. B. xvfb-run) und WebKitGTK.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const windowMode = args.includes('--window');
const bin = args.find((a) => !a.startsWith('--')) ?? join('dist', process.platform === 'win32' ? 'prepchef.exe' : 'prepchef');
const port = Number(process.env.SMOKE_PORT ?? 3199);
const url = `http://127.0.0.1:${port}`;
const data = await mkdtemp(join(tmpdir(), 'prepchef-smoke-'));

let running: { kill(): void } | undefined;

function fail(message: string, output = ''): never {
  running?.kill();
  console.error(`✗ ${message}`);
  if (output) console.error(`--- Ausgabe der App:\n${output}`);
  process.exit(1);
}

async function get(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url + path, init);
  if (!res.ok) fail(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return res;
}

const version = Bun.spawnSync([bin, '--version'], { stdout: 'pipe' }).stdout.toString().trim();
console.log(`Version: ${version || '(keine Ausgabe – unter Windows ohne Konsole normal)'}`);

const app = Bun.spawn([bin, windowMode ? '' : '--server', '--port', String(port), '--data', data].filter(Boolean), {
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, ...(windowMode ? { PREPCHEF_SMOKE_TEST: '1' } : {}) },
});
running = app;
const output = () => Promise.all([new Response(app.stdout).text(), new Response(app.stderr).text()]).then((o) => o.join(''));

try {
  if (windowMode) {
    const timeout = setTimeout(() => app.kill(), 90_000);
    const code = await app.exited;
    clearTimeout(timeout);
    const out = await output();
    // Maßgeblich ist der Exit-Code (0 nur, wenn die Oberfläche im Fenster gerendert wurde) – ohne Konsole
    // (Windows) kommt nicht zwingend Text an.
    if (code !== 0) fail(`App-Fenster: Exit-Code ${code}`, out);
    if (out.trim()) console.log(out.trim());
    console.log('✓ Fenster-Smoke-Test bestanden');
  } else {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      up = await fetch(`${url}/api/health`).then((r) => r.ok, () => false);
      if (!up) await Bun.sleep(200);
    }
    if (!up) fail('Server antwortet nicht', (app.kill(), await output()));

    const health = await (await get('/api/health')).json();
    if (health.app !== 'prepchef') fail('/api/health liefert nicht PrepChef');
    const index = await (await get('/')).text();
    if (!index.includes('<div id="root">')) fail('Frontend wird nicht ausgeliefert');
    if (!(await (await get('/rezepte')).text()).includes('<div id="root">')) fail('Client-Routing liefert die SPA nicht');
    const script = index.match(/\/assets\/[^"]+\.js/)?.[0];
    if (!script) fail('Kein JavaScript-Bundle in index.html');
    await get(script);

    const recipes = (await (await get('/api/recipes')).json()) as unknown[];
    if (!recipes.length) fail('keine Grundrezepte');
    const plan = await (
      await get('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: '2026-01-05', days: [0, 1, 2, 3, 4], slots: ['mittag'], persons: 1, diet: 'alles' }),
      })
    ).json();
    if (!plan.shopping?.length) fail('Plan ohne Einkaufsliste');

    await get('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const exited = await Promise.race([app.exited, Bun.sleep(5000).then(() => null)]);
    if (exited === null) fail('Prozess läuft nach dem Beenden weiter', (app.kill(), await output()));
    console.log(`✓ Smoke-Test bestanden (${recipes.length} Rezepte, ${bin})`);
  }
} finally {
  app.kill();
  await rm(data, { recursive: true, force: true }).catch(() => {});
}
