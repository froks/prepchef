#!/usr/bin/env bun
/**
 * Baut die Desktop-App mit Electron.
 *
 *   bun run package            → dist/: AppImage (Linux), Installer + portable EXE (Windows), DMG (macOS)
 *   bun run package --dir      → nur die entpackte App (dist/*-unpacked bzw. dist/mac*), schneller für Tests
 *   bun run app                → App aus dem Quelltext starten (ohne Paketieren)
 *   bun run package --x64 --arm64   weitere Optionen gehen an electron-builder (hier: beide Architekturen)
 *
 * Gebaut wird immer für das aktuelle System; CI baut auf Linux, Windows und macOS.
 * Version: PREPCHEF_VERSION (z. B. v0.1.0-rc5 aus dem Git-Tag) oder desktop/package.json.
 */
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = join(import.meta.dir, '..');
const desktop = join(root, 'desktop');
const args = process.argv.slice(2);

console.log('▸ Frontend bauen …');
await $`bun run --filter @prepchef/client build`.cwd(root).quiet();

// Hauptprozess samt Server in eine Datei bündeln; Laufzeit ist Electrons Node (node:sqlite).
console.log('▸ Hauptprozess bündeln …');
await rm(join(desktop, 'dist'), { recursive: true, force: true });
await $`bun build src/main.ts --target=node --format=esm --external electron --outfile dist/main.mjs`.cwd(desktop).quiet();

await rm(join(desktop, 'client'), { recursive: true, force: true });
await cp(join(root, 'client', 'dist'), join(desktop, 'client'), { recursive: true });

if (args.includes('--run')) {
  // Pfad zur Electron-Binärdatei; Electron lädt sie beim ersten Aufruf herunter.
  const electron = (await import(join(desktop, 'node_modules', 'electron', 'index.js'))).default as string;
  const proc = Bun.spawn([electron, desktop, ...args.filter((a) => a !== '--run')], { stdio: ['inherit', 'inherit', 'inherit'] });
  process.exit(await proc.exited);
}

const version = (process.env.PREPCHEF_VERSION || (await Bun.file(join(desktop, 'package.json')).json()).version).replace(/^v/, '');
console.log(`▸ Paketieren (Version ${version}) …`);
await $`bun x electron-builder --config electron-builder.config.cjs ${args} -c.extraMetadata.version=${version}`.cwd(desktop);
console.log('✓ Fertig – Ergebnis in dist/');
