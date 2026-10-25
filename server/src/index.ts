import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { directoryAssets } from './assets.ts';
import { openDatabase } from './db.ts';

// Server-Betrieb aus dem Repository (`bun run dev` / `bun run start`). Die Desktop-App startet über desktop/src/main.ts.
const root = fileURLToPath(new URL('../..', import.meta.url));
const db = openDatabase(process.env.PREPCHEF_DB ?? `${root}data/prepchef.db`);
const app = await buildApp({ db, assets: directoryAssets(`${root}client/dist`), logger: true });

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
