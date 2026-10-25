# PrepChef 🥡

Erstellt Wochenpläne fürs Meal-Prep: wählt passende Gerichte aus, erstellt eine zusammengefasste Einkaufsliste,
plant den Kochtag so, dass Ofen und Herd parallel laufen, und zeigt die Nährwerte pro Tag.

## Starten

Voraussetzungen: **Bun** (Pakete und Skripte) und **Node.js ≥ 24** – das Backend läuft auf Node, weil es das
eingebaute `node:sqlite` nutzt und TypeScript direkt ausführt.

```bash
bun install
bun run dev        # Backend :3001 + Frontend :5173 → http://localhost:5173
```

Produktion (ein Prozess, liefert das gebaute Frontend mit aus):

```bash
bun run build
bun run start      # http://127.0.0.1:3001
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
- **Präferenzen „Schnell“ und „Low Carb“:** werden aus den Rezeptdaten abgeleitet – schnell = höchstens 30 Min.
  Gesamtzeit laut Schritten, Low Carb = höchstens 25 g Kohlenhydrate pro Portion (`server/src/domain/traits.ts`).
  Im Planer stark bevorzugt, in der Rezeptliste als Filter.
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
client/src/
  pages/       Planen, Plan, Pläne, Rezepte, Rezept, Editor
  components/  Wochenansicht, Einkaufsliste, Prep-Ablauf, Nährwerte
```

Das Frontend nutzt die Typen und den Zutaten-Parser des Servers direkt.

```bash
bun run test       # Server-Tests (node:test)
bun run typecheck
```
