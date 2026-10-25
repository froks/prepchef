import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { APP_ID, buildApp } from './app.ts';
import type { AssetSource } from './assets.ts';
import { openDatabase } from './db.ts';

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
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
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

const HELP = `PrepChef – Meal-Prep-Wochenplaner

Aufruf: prepchef [Optionen]

  --port <n>       Port (Standard 3001, bei Belegung der nächste freie)
  --host <adresse> Bind-Adresse (Standard 127.0.0.1; 0.0.0.0 = im Netzwerk erreichbar, ohne Login!)
  --data <ordner>  Datenordner (Standard ${defaultDataDir()})
  --no-browser     Browser nicht automatisch öffnen
  -h, --help       Diese Hilfe
`;

function parseArgs(argv: string[]) {
  const opts = {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? '127.0.0.1',
    dataDir: process.env.PREPCHEF_DATA ?? defaultDataDir(),
    browser: !process.env.PREPCHEF_NO_BROWSER,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      console.log(HELP);
      process.exit(0);
    } else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--data') opts.dataDir = argv[++i];
    else if (a === '--no-browser') opts.browser = false;
    else {
      console.error(`Unbekannte Option: ${a}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return opts;
}

/** Startet PrepChef als Desktop-App: Server auf einem freien Port, Browser öffnen, „Beenden" in der Oberfläche. */
export async function runStandalone(assets: AssetSource, argv = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const dbPath = process.env.PREPCHEF_DB ?? join(opts.dataDir, 'prepchef.db');
  const browserHost = opts.host === '0.0.0.0' || opts.host === '::' ? '127.0.0.1' : opts.host;

  // Läuft PrepChef schon? Dann nur den Browser öffnen statt eine zweite Instanz auf derselben Datenbank zu starten.
  const existing = `http://${browserHost}:${opts.port}`;
  if (await isPrepChef(existing)) {
    console.log(`PrepChef läuft bereits: ${existing}`);
    if (opts.browser) openBrowser(existing);
    return;
  }

  const db = openDatabase(dbPath);
  let stop = () => {};
  const app = await buildApp({ db, assets, onShutdown: () => stop() });
  stop = () => {
    console.log('PrepChef wird beendet.');
    app.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let port = opts.port;
  for (let attempt = 0; ; attempt++) {
    try {
      await app.listen({ port, host: opts.host });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 20) throw err;
      port++;
    }
  }

  const url = `http://${browserHost}:${port}`;
  console.log(`PrepChef läuft auf ${url}\nDaten: ${dbPath}\nBeenden mit Strg+C oder über „Beenden" in der App.`);
  if (opts.browser) openBrowser(url);
}
