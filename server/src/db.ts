import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  servings INTEGER NOT NULL,
  meal_types TEXT NOT NULL,
  diet TEXT NOT NULL,
  tags TEXT NOT NULL,
  ingredients TEXT NOT NULL,
  steps TEXT NOT NULL,
  nutrition TEXT,
  fridge_days INTEGER NOT NULL DEFAULT 3,
  freezable INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settings TEXT NOT NULL,
  data TEXT NOT NULL,
  checked TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

type Param = string | number | bigint | null;

export interface Statement {
  run(...params: Param[] | [Record<string, Param>]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: Param[]): unknown;
  all(...params: Param[]): unknown[];
}

/** Gemeinsame Schnittmenge von `node:sqlite` (Node, Tests) und `bun:sqlite` (Bun, kompilierte App). */
export interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}

const require = createRequire(import.meta.url);
const isBun = typeof process.versions.bun === 'string';

function openNative(path: string): Database {
  if (isBun) {
    const { Database } = require('bun:sqlite');
    // strict: benannte Parameter ohne Präfix im Objekt ({ title } für :title) – wie bei node:sqlite.
    return new Database(path, { create: true, strict: true });
  }
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(path);
}

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = openNative(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
