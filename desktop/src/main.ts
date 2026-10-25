import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron';
import { defaultDataDir, startServer } from '../../server/src/server.ts';

/**
 * PrepChef als Desktop-App: Der Server läuft im Electron-Hauptprozess (Node, node:sqlite),
 * das Fenster zeigt die Oberfläche von http://127.0.0.1:<freier Port>.
 */

// CI (scripts/smoke-test.ts): Fenster öffnen, prüfen, ob die Oberfläche rendert, über „Beenden" schließen.
const SMOKE_TEST = !!process.env.PREPCHEF_SMOKE_TEST;
let exitCode = 0;

const dataDir = process.env.PREPCHEF_DATA ?? defaultDataDir();
const dbPath = join(dataDir, 'prepchef.db');

/** Daten einer früheren Flatpak-Installation einmalig übernehmen (nur kopieren). */
function migrateLegacyData(): void {
  if (process.platform !== 'linux' || existsSync(dbPath) || process.env.PREPCHEF_DATA) return;
  const flatpakDir = join(homedir(), '.var', 'app', 'io.github.froks.PrepChef', 'data', 'prepchef');
  if (!existsSync(join(flatpakDir, 'prepchef.db'))) return;
  mkdirSync(dataDir, { recursive: true });
  for (const f of ['prepchef.db', 'prepchef.db-wal', 'prepchef.db-shm']) {
    if (existsSync(join(flatpakDir, f))) copyFileSync(join(flatpakDir, f), join(dataDir, f));
  }
  console.log(`Daten übernommen aus ${flatpakDir}`);
}

// Nur eine Instanz: Ein zweiter Start holt das vorhandene Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window: BrowserWindow | null = null;
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    // Unter macOS braucht es ein Menü, damit Kopieren/Einfügen per Cmd+C/V funktioniert.
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);

    migrateLegacyData();
    const server = await startServer({
      assetsDir: join(app.getAppPath(), 'client'),
      dbPath,
      port: 0,
      host: '127.0.0.1',
      onShutdown: () => app.quit(),
    });

    app.on('will-quit', (event) => {
      event.preventDefault();
      server.app.close().finally(() => app.exit(exitCode));
    });

    window = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 380,
      title: 'PrepChef',
      icon: join(app.getAppPath(), 'build', 'icon.png'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#141816' : '#f7f5f0',
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    window.once('ready-to-show', () => window?.show());

    // Externe Links (Rezeptquellen) im Standardbrowser statt im App-Fenster.
    const isExternal = (url: string) => !url.startsWith(server.url) && /^https?:\/\//.test(url);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternal(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (isExternal(url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });

    if (SMOKE_TEST) runSmokeTest(window);
    await window.loadURL(server.url);
    console.log(`PrepChef läuft auf ${server.url}\nDaten: ${dbPath}`);
  });

  app.on('window-all-closed', () => app.quit());
}

function runSmokeTest(window: BrowserWindow): void {
  exitCode = 1;
  const timeout = setTimeout(() => {
    console.error('Fenster-Smoke-Test: Zeitüberschreitung');
    app.exit(1);
  }, 60_000);
  window.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const result = await window.webContents.executeJavaScript(`(async () => ({
      rendered: !!document.querySelector('.topbar nav'),
      recipes: (await fetch('/api/recipes').then((r) => r.json())).length,
      title: document.title,
    }))()`);
    const ok = result.rendered && result.recipes > 0;
    console.log(`Fenster-Smoke-Test: ${ok ? 'Oberfläche gerendert' : 'FEHLER'} (${JSON.stringify(result)})`);
    exitCode = ok ? 0 : 1;
    clearTimeout(timeout);
    // Beenden über denselben Weg wie der Knopf in der Oberfläche.
    await window.webContents.executeJavaScript(`fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })`);
  });
}
