import { fileURLToPath } from 'node:url';
import { runStandalone } from './standalone.ts';

// Desktop-App aus dem Quelltext starten (`bun run app`). Die kompilierte Datei startet über build/entry.ts.
await runStandalone({
  assets: { kind: 'directory', root: fileURLToPath(new URL('../../client/dist', import.meta.url)) },
  workerSpec: fileURLToPath(new URL('./server-worker.ts', import.meta.url)),
});
