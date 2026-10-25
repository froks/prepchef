import { parentPort } from 'node:worker_threads';
import { startServer, type ServerConfig } from './standalone.ts';

// Läuft in einem eigenen Thread, damit der Server weiterarbeitet, während das App-Fenster
// den Haupt-Thread blockiert (webview.run()).
parentPort!.once('message', async (config: ServerConfig) => {
  try {
    const { url } = await startServer(config, () => parentPort!.postMessage({ type: 'shutdown' }));
    parentPort!.postMessage({ type: 'ready', url });
  } catch (err) {
    parentPort!.postMessage({ type: 'error', message: (err as Error).message });
  }
});
