#!/usr/bin/env bun
/**
 * Startet die gebaute Desktop-App mit leerem Datenordner: Das Fenster öffnet sich, die App prüft selbst, ob die
 * Oberfläche gerendert wurde und Rezepte da sind, und beendet sich über „Beenden" (desktop/src/main.ts).
 *
 *   bun scripts/smoke-test.ts <app>
 *
 * <app>: AppImage (Linux), .exe (Windows) oder die Programmdatei in PrepChef.app/Contents/MacOS (macOS).
 * Unter Linux ohne Bildschirm mit xvfb-run starten.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = process.argv[2];
if (!bin) {
  console.error('Aufruf: bun scripts/smoke-test.ts <app>');
  process.exit(2);
}
const data = await mkdtemp(join(tmpdir(), 'prepchef-smoke-'));

const app = Bun.spawn([bin], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: {
    ...process.env,
    PREPCHEF_SMOKE_TEST: '1',
    PREPCHEF_DATA: data,
    // CI-Runner haben kein FUSE – das AppImage entpackt sich dann selbst.
    APPIMAGE_EXTRACT_AND_RUN: '1',
  },
});
const timeout = setTimeout(() => app.kill(), 120_000);
const code = await app.exited;
clearTimeout(timeout);
const output = (await Promise.all([new Response(app.stdout).text(), new Response(app.stderr).text()])).join('');
await rm(data, { recursive: true, force: true }).catch(() => {});

const rendered = output.includes('Oberfläche gerendert');
console.log(output.trim());
// Unter Windows kommt die Ausgabe einer GUI-App nicht zwingend an – maßgeblich ist dann der Exit-Code.
if (code !== 0 || (!rendered && process.platform !== 'win32')) {
  console.error(`✗ Fenster-Smoke-Test fehlgeschlagen (Exit-Code ${code})`);
  process.exit(1);
}
console.log(`✓ Fenster-Smoke-Test bestanden (${bin})`);
