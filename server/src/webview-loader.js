// Lädt webview-bun erst bei Bedarf: Das Paket öffnet beim Import die native Bibliothek (dlopen) und wirft,
// wenn z. B. unter Linux WebKitGTK fehlt – so kann standalone.ts auf den Browser ausweichen.
// Als .js mit eigener .d.ts, weil webview-bun als TypeScript-Quelltext mit `const enum` ausgeliefert wird,
// den die strengen tsconfig-Einstellungen dieses Projekts nicht erlauben.
export async function loadWebview() {
  const [{ Webview }, { lib }] = await Promise.all([import('webview-bun'), import('webview-bun/src/ffi.ts')]);
  return {
    Webview,
    // Wie Webview.run(), aber ohne das anschließende destroy() – die App beendet sich danach ohnehin,
    // das Betriebssystem räumt das Fenster auf.
    runUntilClosed(window) {
      lib.symbols.webview_run(window.unsafeHandle);
    },
    // Die Webview-Klasse hat kein terminate() – direkt die native Funktion.
    terminate(window) {
      lib.symbols.webview_terminate(window.unsafeHandle);
    },
  };
}
