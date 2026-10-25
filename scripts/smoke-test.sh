#!/bin/sh
# Startet die kompilierte App mit leerem Datenordner und prüft, dass Frontend und API funktionieren.
#   sh scripts/smoke-test.sh [pfad/zur/datei]   (Standard: dist/prepchef)
set -eu

BIN="${1:-dist/prepchef}"
PORT="${SMOKE_PORT:-3199}"
DATA=$(mktemp -d)
URL="http://127.0.0.1:$PORT"
trap 'kill "$PID" 2>/dev/null || true; rm -rf "$DATA"' EXIT

fail() {
  echo "✗ $1"
  echo "--- Ausgabe der App:"
  cat "$DATA/log" || true
  exit 1
}

"$BIN" --version
"$BIN" --no-browser --port "$PORT" --data "$DATA" >"$DATA/log" 2>&1 &
PID=$!

for _ in $(seq 1 50); do
  curl -fs "$URL/api/health" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fs "$URL/api/health" | grep -q '"app":"prepchef"' || fail "Server antwortet nicht"

curl -fs "$URL/" | grep -q '<div id="root">' || fail "Frontend wird nicht ausgeliefert"
curl -fs "$URL/rezepte" | grep -q '<div id="root">' || fail "Client-Routing liefert die SPA nicht"
JS=$(curl -fs "$URL/" | grep -o '/assets/[^"]*\.js' | head -1)
curl -fs -o /dev/null "$URL$JS" || fail "JavaScript-Bundle fehlt ($JS)"

RECIPES=$(curl -fs "$URL/api/recipes" | grep -o '"title"' | wc -l)
[ "$RECIPES" -gt 0 ] || fail "keine Grundrezepte"

curl -fs -X POST "$URL/api/plans" -H 'Content-Type: application/json' \
  -d '{"weekStart":"2026-01-05","days":[0,1,2,3,4],"slots":["mittag"],"persons":1,"diet":"alles"}' \
  | grep -q '"shopping"' || fail "Plan konnte nicht erstellt werden"

curl -fs -X POST "$URL/api/shutdown" -H 'Content-Type: application/json' -d '{}' >/dev/null || fail "Beenden fehlgeschlagen"
for _ in $(seq 1 25); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.2
done
kill -0 "$PID" 2>/dev/null && fail "Prozess läuft nach dem Beenden weiter"

echo "✓ Smoke-Test bestanden ($RECIPES Rezepte, $BIN)"
