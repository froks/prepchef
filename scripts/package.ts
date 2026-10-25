#!/usr/bin/env bun
/**
 * Baut PrepChef als eigenständige ausführbare Datei (Frontend eingebettet, keine Installation von Node/Bun nötig).
 *
 *   bun run package                          → dist/prepchef (für dieses System)
 *   bun run package --all                    → Linux, Windows und macOS (x64/arm64)
 *   bun run package --targets linux-x64,…    → nur diese (Namen wie in TARGETS ohne „prepchef-")
 *
 * Für Windows ohne Konsolenfenster und mit Icon muss auf Windows selbst gebaut werden.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { $ } from 'bun';

// Version für `prepchef --version`: aus CI (Tag) oder `git describe`, sonst „dev".
const version =
  process.env.PREPCHEF_VERSION ||
  (await $`git describe --tags --always --dirty`.cwd(join(import.meta.dir, '..')).nothrow().quiet().text()).trim() ||
  'dev';

const root = join(import.meta.dir, '..');
const clientDist = join(root, 'client', 'dist');
const buildDir = join(root, 'build');
const outDir = join(root, 'dist');

const TARGETS = [
  { name: 'linux-x64', target: 'bun-linux-x64', file: 'prepchef-linux-x64' },
  { name: 'linux-arm64', target: 'bun-linux-arm64', file: 'prepchef-linux-arm64' },
  { name: 'windows-x64', target: 'bun-windows-x64', file: 'prepchef-windows-x64.exe' },
  { name: 'macos-x64', target: 'bun-darwin-x64', file: 'prepchef-macos-x64' },
  { name: 'macos-arm64', target: 'bun-darwin-arm64', file: 'prepchef-macos-arm64' },
];

function selectTargets(): { target?: string; file: string }[] {
  const i = process.argv.indexOf('--targets');
  if (i >= 0) {
    const names = (process.argv[i + 1] ?? '').split(',').filter(Boolean);
    const unknown = names.filter((n) => !TARGETS.some((t) => t.name === n));
    if (!names.length || unknown.length) {
      console.error(`Unbekannte Ziele: ${unknown.join(', ') || '(keine)'} – möglich: ${TARGETS.map((t) => t.name).join(', ')}`);
      process.exit(2);
    }
    return TARGETS.filter((t) => names.includes(t.name));
  }
  if (process.argv.includes('--all')) return TARGETS;
  return [{ file: process.platform === 'win32' ? 'prepchef.exe' : 'prepchef' }];
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

console.log('▸ Frontend bauen …');
await $`bun run --filter @prepchef/client build`.cwd(root).quiet();

// Jede Frontend-Datei wird per `with { type: 'file' }` eingebettet; Bun legt sie im Binary ab und
// liefert zur Laufzeit einen Pfad, der sich mit fs lesen lässt.
const files = await listFiles(clientDist);
await rm(buildDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
const imports = files.map((f, i) => `import f${i} from ${JSON.stringify(relative(buildDir, f))} with { type: 'file' };`);
const entries = files.map((f, i) => `  [${JSON.stringify(`/${relative(clientDist, f).split('\\').join('/')}`)}, f${i}],`);
const entry = join(buildDir, 'entry.ts');
await writeFile(
  entry,
  `// Automatisch erzeugt von scripts/package.ts – nicht bearbeiten.
${imports.join('\n')}
import { runStandalone } from '../server/src/standalone.ts';

await runStandalone({
  assets: {
    kind: 'embedded',
    files: [
${entries.join('\n')}
    ],
  },
  // Pfad relativ zur Wurzel aller Einstiegspunkte (build/ und server/ → Repository).
  workerSpec: './server/src/server-worker.ts',
});
`,
);
console.log(`▸ ${files.length} Frontend-Dateien eingebettet, Version ${version}`);

// Der Server läuft im Fenster-Modus in einem Worker-Thread und braucht einen eigenen Einstiegspunkt.
const worker = join(root, 'server', 'src', 'server-worker.ts');

/** Kein Konsolenfenster und ein eigenes Icon – setzt Bun nur beim Kompilieren auf Windows selbst um. */
function windowsFlags(target: string | undefined): string[] {
  const forWindows = target ? target.includes('windows') : process.platform === 'win32';
  if (!forWindows || process.platform !== 'win32') return [];
  return ['--windows-hide-console', `--windows-icon=${join(root, 'client', 'public', 'icon.ico')}`, '--windows-title=PrepChef'];
}

await mkdir(outDir, { recursive: true });
const targets = selectTargets();
for (const { target, file } of targets) {
  const outfile = join(outDir, file);
  console.log(`▸ Kompiliere ${relative(root, outfile)}${target ? ` (${target})` : ''} …`);
  await $`bun build ${entry} ${worker} --compile --minify --define ${`process.env.PREPCHEF_VERSION=${JSON.stringify(version)}`} ${target ? [`--target=${target}`] : []} ${windowsFlags(target)} --outfile ${outfile}`
    .cwd(root)
    .quiet();
}
console.log('✓ Fertig. Starten mit ./dist/prepchef');
