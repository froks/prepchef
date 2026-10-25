import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { openDatabase } from './db.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const db = openDatabase(process.env.PREPCHEF_DB ?? `${root}data/prepchef.db`);
const app = await buildApp({ db, staticDir: `${root}client/dist`, logger: true });

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
