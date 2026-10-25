#!/usr/bin/env bun
/**
 * Baut PrepChef als eigenständige ausführbare Datei (Frontend eingebettet, keine Installation von Node/Bun nötig).
 *
 *   bun run package            → dist/prepchef (für dieses System)
 *   bun run package --all      → zusätzlich Linux, Windows und macOS (x64/arm64)
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
  { target: 'bun-linux-x64', file: 'prepchef-linux-x64' },
  { target: 'bun-linux-arm64', file: 'prepchef-linux-arm64' },
  { target: 'bun-windows-x64', file: 'prepchef-windows-x64.exe' },
  { target: 'bun-darwin-x64', file: 'prepchef-macos-x64' },
  { target: 'bun-darwin-arm64', file: 'prepchef-macos-arm64' },
];

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
import { embeddedAssets } from '../server/src/assets.ts';
import { runStandalone } from '../server/src/standalone.ts';

await runStandalone(embeddedAssets(new Map<string, string>([
${entries.join('\n')}
])));
`,
);
console.log(`▸ ${files.length} Frontend-Dateien eingebettet, Version ${version}`);

await mkdir(outDir, { recursive: true });
const targets = process.argv.includes('--all') ? TARGETS : [{ target: undefined, file: process.platform === 'win32' ? 'prepchef.exe' : 'prepchef' }];
for (const { target, file } of targets) {
  const outfile = join(outDir, file);
  console.log(`▸ Kompiliere ${relative(root, outfile)}${target ? ` (${target})` : ''} …`);
  await $`bun build ${entry} --compile --minify --define ${`process.env.PREPCHEF_VERSION=${JSON.stringify(version)}`} ${target ? [`--target=${target}`] : []} --outfile ${outfile}`
    .cwd(root)
    .quiet();
}
console.log('✓ Fertig. Starten mit ./dist/prepchef');
