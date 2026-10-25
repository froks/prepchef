// electron-builder: Linux AppImage, Windows Installer + portable EXE, macOS DMG.
// Aufgerufen von scripts/package.ts, das vorher dist/main.mjs und client/ erzeugt.
// Zur Chromium-Sandbox unter Linux: Das AppRun-Skript des AppImages prüft selbst per `unshare -Ur true`, ob
// unprivilegierte User-Namespaces erlaubt sind (Ubuntu sperrt sie ab 24.04), und setzt nur dann --no-sandbox.

module.exports = {
  appId: 'io.github.froks.prepchef',
  productName: 'PrepChef',
  directories: { output: '../dist', buildResources: 'build' },
  files: ['dist/**', 'client/**', 'build/icon.png', 'package.json'],
  asar: true,
  linux: {
    target: ['AppImage'],
    // Unter Linux üblich: Befehl in Kleinbuchstaben (Windows/macOS: „PrepChef").
    executableName: 'prepchef',
    // Fenster und Menüeintrag zusammenführen (app_id / WM_CLASS = desktopName aus package.json).
    syncDesktopName: true,
    category: 'Utility',
    icon: 'build/icon.png',
    synopsis: 'Wochenpläne fürs Meal-Prep',
    description: 'Wochenpläne, Einkaufslisten und Kochtag-Ablauf fürs Meal-Prep',
    artifactName: 'prepchef-${version}-linux-${arch}.${ext}',
  },
  win: {
    target: ['nsis', 'portable'],
    icon: 'build/icon.ico',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    artifactName: 'prepchef-${version}-windows-${arch}-setup.${ext}',
  },
  portable: {
    artifactName: 'prepchef-${version}-windows-${arch}-portable.${ext}',
  },
  mac: {
    target: ['dmg'],
    category: 'public.app-category.lifestyle',
    icon: 'build/icon.png',
    // Ohne Apple-Zertifikat nur ad-hoc signiert (siehe README) – Apple Silicon startet nichts ganz Unsigniertes.
    identity: '-',
    // Hardened Runtime ist nur für die Notarisierung nötig; ad-hoc signiert kann sie den Start blockieren.
    hardenedRuntime: false,
    artifactName: 'prepchef-${version}-macos-${arch}.${ext}',
  },
  publish: null,
};
