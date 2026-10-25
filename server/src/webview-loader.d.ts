/**
 * Die von PrepChef genutzte Teilmenge der webview-bun-API (2.4.0) – abgeglichen mit
 * node_modules/webview-bun/src/webview.ts. Die Klasse hat kein terminate(); dafür dient terminate() unten.
 */
export interface WebviewWindow {
  title: string;
  size: { width: number; height: number; hint: number };
  navigate(url: string): void;
  /** Rückgabewerte gehen per JSON.stringify an die Seite – `undefined` lässt das Promise dort scheitern. */
  bind(name: string, callback: (...args: any[]) => any): void;
  /** Wie bind(), aber ohne Antwort an die Seite. */
  bindRaw(name: string, callback: (seq: string, req: string) => void): void;
  /** Skript, das vor jedem Seitenaufbau im Fenster ausgeführt wird. */
  init(source: string): void;
  readonly unsafeHandle: unknown;
}

export type WebviewConstructor = new (debug?: boolean, size?: { width: number; height: number; hint: number }) => WebviewWindow;

export function loadWebview(): Promise<{
  Webview: WebviewConstructor;
  /** Blockiert, bis das Fenster geschlossen oder terminate() aufgerufen wird. */
  runUntilClosed(window: WebviewWindow): void;
  /** Beendet die Fensterschleife (webview_terminate). */
  terminate(window: WebviewWindow): void;
}>;
