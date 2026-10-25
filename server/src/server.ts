import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.ts';
import { directoryAssets } from './assets.ts';
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

export interface ServerConfig {
  /** Gebautes Frontend (client/dist). */
  assetsDir: string;
  dbPath: string;
  /** 0 = freier Port vom Betriebssystem. */
  port: number;
  host: string;
  onShutdown?: () => void;
}

/** Startet den PrepChef-Server; für die Desktop-App (desktop/src/main.ts). */
export async function startServer(config: ServerConfig) {
  const db = openDatabase(config.dbPath);
  const app = await buildApp({ db, assets: directoryAssets(config.assetsDir), onShutdown: config.onShutdown });
  await app.listen({ port: config.port, host: config.host });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  return { app, url: `http://${config.host}:${port}` };
}
