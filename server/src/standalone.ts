import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { APP_ID, buildApp } from './app.ts';
import { type AssetSource, directoryAssets, embeddedAssets } from './assets.ts';
import { openDatabase } from './db.ts';
import type { WebviewConstructor, WebviewWindow } from './webview-loader.js';

/** Wo die Desktop-App ihre Datenbank ablegt – je nach Betriebssystem üblicher Ort für Anwendungsdaten. */
export function defaultDataDir(): string {
  const home = homedir();
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'PrepChef');
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'PrepChef');
    default:
      return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'prepchef');
  }
}

export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  } catch {
    // Kein Browser gefunden – die URL steht ja in der Konsole.
  }
}

async function isPrepChef(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).app === APP_ID;
  } catch {
    return false;
  }
}

/** Beim Kompilieren von scripts/package.ts eingesetzt. */
export const VERSION = process.env.PREPCHEF_VERSION ?? 'dev';

/** Woher das Frontend kommt – serialisierbar, damit es an den Server-Worker übergeben werden kann. */
export type AssetConfig = { kind: 'embedded'; files: [string, string][] } | { kind: 'directory'; root: string };

export interface ServerConfig {
  assets: AssetConfig;
  dbPath: string;
  port: number;
  host: string;
}

function assetSource(config: AssetConfig): AssetSource {
  return config.kind === 'embedded' ? embeddedAssets(new Map(config.files)) : directoryAssets(config.root);
}

function browserUrl(host: string, port: number): string {
  return `http://${host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host}:${port}`;
}

/** Startet den Server auf dem gewünschten oder nächsten freien Port. */
export async function startServer(config: ServerConfig, onShutdown: () => void) {
  const db = openDatabase(config.dbPath);
  const app = await buildApp({ db, assets: assetSource(config.assets), onShutdown });
  let port = config.port;
  for (let attempt = 0; ; attempt++) {
    try {
      await app.listen({ port, host: config.host });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 20) throw err;
      port++;
    }
  }
  return { app, url: browserUrl(config.host, port) };
}

type Mode = 'window' | 'browser' | 'server';

const HELP = `PrepChef ${VERSION} – Meal-Prep-Wochenplaner

Aufruf: prepchef [Optionen]

Startet PrepChef in einem eigenen Fenster. Fehlt die Webview des Systems (Linux: Paket
libwebkitgtk-6.0-4), öffnet sich stattdessen der Browser.

  --browser        Im Standardbrowser statt im eigenen Fenster öffnen
  --server         Nur den Server starten, kein Fenster/Browser (auch: --no-browser)
  --port <n>       Port (Standard 3001, bei Belegung der nächste freie)
  --host <adresse> Bind-Adresse (Standard 127.0.0.1; 0.0.0.0 = im Netzwerk erreichbar, ohne Login!)
  --data <ordner>  Datenordner (Standard ${defaultDataDir()})
  -v, --version    Version anzeigen
  -h, --help       Diese Hilfe
`;

function parseArgs(argv: string[]) {
  const opts = {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? '127.0.0.1',
    dataDir: process.env.PREPCHEF_DATA ?? defaultDataDir(),
    mode: (process.env.PREPCHEF_NO_BROWSER ? 'server' : 'window') as Mode,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      console.log(HELP);
      process.exit(0);
    } else if (a === '-v' || a === '--version') {
      console.log(VERSION);
      process.exit(0);
    } else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--data') opts.dataDir = argv[++i];
    else if (a === '--browser') opts.mode = 'browser';
    else if (a === '--server' || a === '--no-browser') opts.mode = 'server';
    else {
      console.error(`Unbekannte Option: ${a}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return opts;
}

export interface StandaloneOptions {
  assets: AssetConfig;
  /** Wie der Server-Worker gestartet wird – unterscheidet sich zwischen Entwicklung und kompilierter Datei. */
  workerSpec: string;
}

/**
 * Startet PrepChef als Desktop-App. Im Fenster-Modus läuft der Server in einem Worker-Thread,
 * weil das Fenster (webview.run()) den Haupt-Thread bis zum Schließen blockiert.
 */
export async function runStandalone(options: StandaloneOptions, argv = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const config: ServerConfig = {
    assets: options.assets,
    dbPath: process.env.PREPCHEF_DB ?? join(opts.dataDir, 'prepchef.db'),
    port: opts.port,
    host: opts.host,
  };

  // Läuft PrepChef schon? Dann nur ein Fenster bzw. den Browser dazu öffnen statt einer zweiten Instanz
  // auf derselben Datenbank.
  const existing = browserUrl(opts.host, opts.port);
  if (await isPrepChef(existing)) {
    console.log(`PrepChef läuft bereits: ${existing}`);
    if (opts.mode === 'window') await openWindowOrBrowser(existing);
    else if (opts.mode === 'browser') openBrowser(existing);
    return;
  }

  if (opts.mode !== 'window') {
    const stop = () => {
      console.log('PrepChef wird beendet.');
      server.app.close().finally(() => process.exit(0));
    };
    const server = await startServer(config, () => stop());
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    console.log(`PrepChef läuft auf ${server.url}\nDaten: ${config.dbPath}\nBeenden mit Strg+C oder über „Beenden" in der App.`);
    if (opts.mode === 'browser') openBrowser(server.url);
    return;
  }

  const worker = new Worker(options.workerSpec);
  const url = await new Promise<string>((resolve, reject) => {
    worker.on('message', (msg: { type: string; url?: string; message?: string }) => {
      if (msg.type === 'ready') resolve(msg.url!);
      else if (msg.type === 'error') reject(new Error(msg.message));
      // „Beenden" im Browser-Fallback – im Fenster-Modus beendet das Fenster selbst.
      else if (msg.type === 'shutdown') process.exit(0);
    });
    worker.on('error', reject);
    worker.postMessage(config);
  });
  console.log(`PrepChef läuft auf ${url}\nDaten: ${config.dbPath}`);

  const closed = await openWindowOrBrowser(url);
  // Fenster geschlossen → App beenden. Im Browser-Fallback läuft der Server weiter, bis „Beenden" gedrückt wird.
  if (closed) {
    smokeLog('Server-Worker wird gestoppt');
    await worker.terminate();
    smokeLog('App wird beendet');
    process.exit(smokeTestFailed ? 1 : 0);
  }
}

/**
 * Fenster-Smoke-Test für CI (scripts/smoke-test.ts --window): Das Fenster meldet nach dem Laden, ob die
 * Oberfläche gerendert wurde, und schließt sich dann selbst. Ohne Webview gibt es hier keinen Browser-Fallback.
 */
const SMOKE_TEST = !!process.env.PREPCHEF_SMOKE_TEST;
let smokeTestFailed = SMOKE_TEST;

// Ungepuffert, damit die Zeilen auch dann ankommen, wenn der Prozess hängt und abgebrochen wird.
function smokeLog(message: string): void {
  if (SMOKE_TEST) writeSync(1, `Fenster-Smoke-Test [${new Date().toISOString().slice(11, 23)}]: ${message}\n`);
}

/** Öffnet das App-Fenster und blockiert, bis es geschlossen wird. Gibt false zurück, wenn stattdessen der Browser geöffnet wurde. */
async function openWindowOrBrowser(url: string): Promise<boolean> {
  let Webview: WebviewConstructor;
  let runUntilClosed: (window: WebviewWindow) => void;
  let terminate: (window: WebviewWindow) => void;
  try {
    ({ Webview, runUntilClosed, terminate } = await (await import('./webview-loader.js')).loadWebview());
  } catch (err) {
    if (SMOKE_TEST) {
      console.error(`Fenster-Smoke-Test: Webview nicht verfügbar – ${(err as Error).message}`);
      process.exit(1);
    }
    console.error(
      `Kein eigenes Fenster möglich (${(err as Error).message.split('\n')[0]}).\n` +
        (process.platform === 'linux' ? 'Unter Linux wird WebKitGTK benötigt: sudo apt install libwebkitgtk-6.0-4\n' : '') +
        'PrepChef öffnet sich stattdessen im Browser.',
    );
    openBrowser(url);
    return false;
  }

  const window = new Webview(false, { width: 1280, height: 860, hint: 0 });
  window.title = 'PrepChef';
  // Für die Oberfläche: „Beenden" schließt das Fenster, externe Links öffnen im Standardbrowser.
  // bindRaw: nach dem Beenden soll keine Antwort mehr an die (dann geschlossene) Seite gehen.
  window.bindRaw('prepchefQuit', () => {
    smokeLog('prepchefQuit → terminate()');
    terminate(window);
  });
  // Rückgabewerte gehen per JSON an die Seite – `undefined` ließe das Promise dort scheitern.
  window.bind('prepchefOpenExternal', (link: string) => {
    if (/^https?:\/\//.test(link)) openBrowser(link);
    return true;
  });
  if (SMOKE_TEST) {
    // Meldet das Ergebnis und schließt dann über denselben Weg wie der Knopf „Beenden" (prepchefQuit).
    window.bind('prepchefSmokeResult', (rendered: boolean, title: string, href: string) => {
      smokeTestFailed = !rendered;
      console.log(`Fenster-Smoke-Test: ${rendered ? 'Oberfläche gerendert' : 'Oberfläche NICHT gerendert'} („${title}", ${href})`);
      smokeLog('Fenster wird über „Beenden" geschlossen');
      return true;
    });
    window.init(`addEventListener('load', () => setTimeout(async () => {
      try {
        await prepchefSmokeResult(!!document.querySelector('.topbar nav') && typeof prepchefQuit === 'function', document.title, location.href);
      } finally {
        prepchefQuit();
      }
    }, 1500));`);
  }
  window.navigate(url);
  runUntilClosed(window);
  smokeLog('Fensterschleife beendet');
  return true;
}
