import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export interface Asset {
  body: Uint8Array;
  type: string;
}

/** Liefert eine Datei des gebauten Frontends für einen URL-Pfad wie „/assets/index-abc.js". */
export type AssetSource = (path: string) => Promise<Asset | null>;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Dateien aus einem Verzeichnis (client/dist bzw. in der Desktop-App aus dem App-Paket). */
export function directoryAssets(root: string): AssetSource {
  const base = resolve(root);
  return async (path) => {
    const file = resolve(join(base, normalize(decodeURIComponent(path))));
    if (file !== base && !file.startsWith(base + sep)) return null;
    try {
      return { body: await readFile(file), type: contentType(file) };
    } catch {
      return null;
    }
  };
}
