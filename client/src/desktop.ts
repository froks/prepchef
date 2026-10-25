/**
 * Brücke zum App-Fenster (server/src/standalone.ts bindet diese Funktionen per webview.bind).
 * Im normalen Browser fehlen sie – dann gelten die üblichen Browser-Wege.
 */
interface DesktopBridge {
  prepchefQuit?: () => Promise<void>;
  prepchefOpenExternal?: (url: string) => Promise<void>;
}

const bridge = window as unknown as DesktopBridge;

export function isDesktopWindow(): boolean {
  return typeof bridge.prepchefQuit === 'function';
}

/** Beendet PrepChef: im App-Fenster das Fenster schließen, sonst den Server stoppen. */
export async function quitApp(): Promise<void> {
  if (bridge.prepchefQuit) return bridge.prepchefQuit();
  await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

/** Externe Links im Standardbrowser öffnen – ein App-Fenster soll nicht zur Rezeptseite wegnavigieren. */
export function openExternal(url: string): void {
  if (bridge.prepchefOpenExternal) void bridge.prepchefOpenExternal(url);
  else window.open(url, '_blank', 'noopener');
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Manche Webviews erlauben die Clipboard-API nicht – klassischer Weg über ein unsichtbares Textfeld.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}
