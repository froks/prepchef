# PrepChef 🥡

Erstellt Wochenpläne fürs Meal-Prep: wählt passende Gerichte aus, erstellt eine zusammengefasste Einkaufsliste,
plant den Kochtag so, dass Ofen und Herd parallel laufen, und zeigt die Nährwerte pro Tag.

## Als App installieren

PrepChef lässt sich zu **einer einzigen ausführbaren Datei** kompilieren – Frontend und Laufzeit sind eingebettet,
auf dem Zielrechner muss nichts installiert sein. Zum Bauen wird [Bun](https://bun.sh) gebraucht.

```bash
bun install
bun run install-app   # Linux: baut, installiert nach ~/.local/bin, legt Eintrag im Anwendungsmenü an
```

Danach startet PrepChef über das Anwendungsmenü oder mit `prepchef`: Der Server startet, der Browser öffnet sich,
und „Beenden“ oben rechts stoppt ihn wieder. Ein zweiter Start öffnet nur den Browser, ist Port 3001 belegt,
wird der nächste freie genommen. Beim ersten Installieren wird `data/prepchef.db` aus dem Repository übernommen
(kopiert; der Entwicklungsserver muss dafür beendet sein).

Nur die Datei bauen, ohne zu installieren:

```bash
bun run package       # → dist/prepchef
bun run package:all   # zusätzlich Linux arm64, Windows x64, macOS x64/arm64
./dist/prepchef --help
```

Die App speichert ihre Daten unter `~/.local/share/prepchef/` (Linux), `~/Library/Application Support/PrepChef/`
(macOS) bzw. `%APPDATA%\PrepChef\` (Windows); `--data <ordner>` wählt einen anderen Ort.

## Entwickeln

Voraussetzungen: **Bun** sowie **Node.js ≥ 24** für die Tests. Die Datenbank läuft unter Bun mit `bun:sqlite`,
unter Node mit `node:sqlite` (`server/src/db.ts`).

```bash
bun install
bun run dev        # Backend :3001 + Frontend :5173 → http://localhost:5173
bun run build && bun run start   # ein Prozess mit gebautem Frontend → http://127.0.0.1:3001
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
  standalone.ts  Start als Desktop-App (Datenordner, Port, Browser)
scripts/
  package.ts   baut die ausführbare Datei (bun build --compile)
  install-linux.sh
client/src/
  pages/       Planen, Plan, Pläne, Rezepte, Rezept, Editor
  components/  Wochenansicht, Einkaufsliste, Prep-Ablauf, Nährwerte
```

Das Frontend nutzt die Typen und den Zutaten-Parser des Servers direkt.

```bash
bun run test       # Server-Tests (node:test)
bun run typecheck
```
