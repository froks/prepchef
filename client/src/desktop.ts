/** Beendet PrepChef. In der Desktop-App schließt der Server dabei auch das Fenster. */
export async function quitApp(): Promise<void> {
  await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

/** Externe Links in neuem Tab bzw. – in der Desktop-App – im Standardbrowser öffnen. */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Ohne Clipboard-API (z. B. unsicherer Kontext) – klassischer Weg über ein unsichtbares Textfeld.
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
