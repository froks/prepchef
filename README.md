# PrepChef 🥡

Erstellt Wochenpläne fürs Meal-Prep: wählt passende Gerichte aus, erstellt eine zusammengefasste Einkaufsliste,
plant den Kochtag so, dass Ofen und Herd parallel laufen, und zeigt die Nährwerte pro Tag.

![Wochenplan mit Frühstück, Mittag- und Abendessen](docs/screenshots/woche.png)

## Screenshots

| | |
|---|---|
| **Planen** – Tage, Mahlzeiten, Personen, Kalorienziel, Präferenzen | **Prep-Ablauf** – Zeitplan für den Kochtag, passive Schritte laufen nebenbei |
| ![Planer](docs/screenshots/planer.png) | ![Prep-Ablauf](docs/screenshots/prep-ablauf.png) |
| **Einkaufsliste** – zusammengefasst, nach Supermarkt-Bereichen, abhakbar | **Nährwerte** – pro Tag und Person, verglichen mit dem Ziel |
| ![Einkaufsliste](docs/screenshots/einkaufsliste.png) | ![Nährwerte](docs/screenshots/naehrwerte.png) |
| **Rezepte** – Filter, aktive und Gesamtzeit, URL-Import | **Rezept** – Zutaten auf beliebige Portionen umrechnen |
| ![Rezepte](docs/screenshots/rezepte.png) | ![Rezept](docs/screenshots/rezept.png) |
| **Heller Modus** – folgt der Systemeinstellung | **Mobil** – Einkaufsliste im Supermarkt |
| ![Heller Modus](docs/screenshots/hell.png) | <img src="docs/screenshots/mobil.png" alt="Mobilansicht" width="260"> |

Die Screenshots erzeugt `bun run screenshots` neu (Demo-Daten, Chromium wird ferngesteuert).

## Herunterladen

Fertige Pakete gibt es unter **Releases** – PrepChef ist eine Desktop-App (Electron) mit eigenem Fenster und bringt
alles mit, was es braucht:

| System | Datei | Start |
|---|---|---|
| Linux | `prepchef-…-linux-x86_64.AppImage` (oder `-arm64`) | `chmod +x` und starten – oder mit Menüeintrag installieren: `sh scripts/install-linux.sh <datei>` |
| Windows | `prepchef-…-windows-x64-setup.exe` | Installer ohne Admin-Rechte; alternativ `…-portable.exe` ohne Installation |
| macOS | `prepchef-…-macos-arm64.dmg` (Apple Silicon) bzw. `-x64` (Intel) | DMG öffnen, PrepChef in „Programme“ ziehen |

Schließen des Fensters oder „Beenden“ oben rechts beendet die App; ein zweiter Start holt das offene Fenster nach
vorn. Unter Linux schaltet das AppImage die Chromium-Sandbox nur dann ab, wenn das System keine unprivilegierten
User-Namespaces erlaubt (Ubuntu ab 24.04 ohne AppArmor-Profil) – das Fenster zeigt ausschließlich die lokale
Oberfläche, externe Links öffnen im Standardbrowser.

Die Pakete sind nicht von einer Zertifizierungsstelle signiert – Windows (SmartScreen: „Weitere Informationen“ →
„Trotzdem ausführen“) und macOS (Gatekeeper) warnen daher beim ersten Start; unter macOS hilft
`xattr -cr /Applications/PrepChef.app`. Prüfsummen stehen in `SHA256SUMS`.

Die App speichert ihre Daten unter `~/.local/share/prepchef/` (Linux), `~/Library/Application Support/PrepChef/`
(macOS) bzw. `%APPDATA%\PrepChef\` (Windows). Daten einer früheren Flatpak-Installation übernimmt sie beim ersten
Start, `scripts/install-linux.sh` übernimmt `data/prepchef.db` aus dem Repository.

## Entwickeln

Voraussetzungen: **Bun** sowie **Node.js ≥ 24** für die Tests. Die Datenbank läuft unter Bun mit `bun:sqlite`,
unter Node und in der Desktop-App (Electrons Node) mit `node:sqlite` (`server/src/db.ts`).

```bash
bun install
bun run dev        # Backend :3001 + Frontend :5173 → http://localhost:5173
bun run build && bun run start   # ein Prozess mit gebautem Frontend → http://127.0.0.1:3001
bun run app        # Desktop-App (Electron) aus dem Quelltext starten
bun run package    # Pakete für dieses System → dist/ (Linux: AppImage, Windows: Installer/portable, macOS: DMG)
```

| Variable       | Standard            | Zweck                    |
| -------------- | ------------------- | ------------------------ |
| `PORT`         | `3001`              | Port des Backends        |
| `HOST`         | `127.0.0.1`         | Bind-Adresse             |
| `PREPCHEF_DB`  | `data/prepchef.db`  | Pfad zur SQLite-Datei    |

Beim ersten Start wird die Datenbank mit 96 Grundrezepten befüllt. Kommen in einer neuen Version Grundrezepte
hinzu, werden sie in bestehende Datenbanken nachgeliefert – selbst gelöschte Grundrezepte bleiben gelöscht.

## Funktionen

- **Planer:** Tage, Mahlzeiten, Personen, Kalorienziel, Ernährungsform, Ausschlüsse, ein oder zwei Kochtage.
  Bevorzugt Gerichte mit gemeinsamen Zutaten, achtet auf Haltbarkeit (kurz Haltbares zuerst essen, sonst einfrieren),
  Abwechslung (Tags, zuletzt gekochte Gerichte) und Favoriten. Einzelne Gerichte lassen sich austauschen.
- **Zeiten:** Jedes Rezept hat eine *Gesamtzeit* (alle Schritte inkl. Garen, Backen, Auftauen) und eine *aktive
  Zeit* (nur Schritte, die nicht als „nebenbei“ markiert sind).
- **Präferenzen:** werden aus den Rezeptdaten abgeleitet (`server/src/domain/traits.ts`) – im Planer stark bevorzugt,
  in der Rezeptliste als Filter:
  - *Schnell fertig* – höchstens 30 Min. Gesamtzeit
  - *Wenig Aufwand* – höchstens 20 Min. aktive Zeit
  - *Low Carb* – höchstens 25 g Kohlenhydrate pro Portion
- **Einkaufsliste:** skaliert auf Personen × Mahlzeiten, rechnet Einheiten um (g/kg, ml/l, TL/EL), fasst
  Singular/Plural zusammen, sortiert nach Supermarkt-Bereichen, abhakbar, als Text kopierbar.
- **Prep-Ablauf:** Zeitplan für eine Person in der Küche – aktive Schritte nacheinander, passive (Ofen, Köcheln,
  Quellen) laufen nebenbei. Mit Gantt-Übersicht und Anzahl der Boxen.
- **Nährwerte:** pro Tag und Person; das Tagesziel wird anteilig auf die geplanten Mahlzeiten verteilt.
- **Rezepte:** anlegen, bearbeiten, favorisieren. Zutaten als Freitext („1 Dose Tomaten, gehackt (400 g)“) mit
  Live-Vorschau, wie sie verstanden werden.
- **URL-Import:** liest `schema.org/Recipe` (JSON-LD) – funktioniert u. a. mit Chefkoch, Lecker, EatSmarter,
  BBC Good Food. Der Import ist ein Entwurf, der vor dem Speichern geprüft wird (Haltbarkeit und Schrittdauern
  stehen selten auf Rezeptseiten).

## Aufbau

```
server/src/
  domain/      reine Logik: ingredients (Parser, Kategorien), units, importer,
               planner, shopping, timeline, nutrition
  repo/        SQLite-Zugriff (Rezepte, Pläne)
  seed/        Grundrezepte
  app.ts       Fastify-Routen (/api/...)
  index.ts     Start aus dem Repository (dev/start)
  server.ts    Server-Start für die Desktop-App (Datenordner, freier Port)
desktop/
  src/main.ts  Electron-Hauptprozess: Server, Fenster, eine Instanz, externe Links
  electron-builder.config.cjs  Pakete: AppImage, NSIS/portable, DMG
  build/       Icons
client/src/
  pages/       Planen, Plan, Pläne, Rezepte, Rezept, Editor
  components/  Wochenansicht, Einkaufsliste, Prep-Ablauf, Nährwerte
scripts/
  package.ts       bündelt den Hauptprozess (bun build) und ruft electron-builder auf
  smoke-test.ts    startet die gebaute App und prüft das Fenster
  install-linux.sh installiert das AppImage mit Menüeintrag
  screenshots.ts   erzeugt docs/screenshots/ (bun run screenshots)
```

Das Frontend nutzt die Typen und den Zutaten-Parser des Servers direkt.

```bash
bun run test       # Server-Tests (node:test)
bun run typecheck
```

## CI und Releases

`.github/workflows/ci.yml` läuft bei jedem Push und Pull Request: Typecheck, Tests, Frontend-Build, dann baut jede
Plattform (Linux, Windows, macOS) auf ihrem eigenen Runner die Pakete und startet die App per
`scripts/smoke-test.ts` wirklich: Das Fenster prüft nach dem Laden selbst, ob die Oberfläche gerendert wurde und
Rezepte da sind, und beendet sich über denselben Weg wie „Beenden“ (Linux: das AppImage unter virtuellem Display).

Ein Tag `v*` erstellt zusätzlich ein GitHub-Release mit den Paketen für alle Plattformen und `SHA256SUMS`;
Tags mit Bindestrich (z. B. `v1.0.0-rc.1`) werden als Vorabversion markiert.

```bash
git tag v0.1.0
git push origin v0.1.0
```
