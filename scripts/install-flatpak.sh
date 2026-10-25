#!/bin/sh
# Installiert PrepChef als Flatpak für den aktuellen Benutzer (ohne sudo) und übernimmt beim ersten Mal
# vorhandene Daten – aus einer früheren Installation (~/.local/share/prepchef) oder aus dem Repository.
#
#   sh scripts/install-flatpak.sh                       neuestes Release von GitHub herunterladen
#   sh scripts/install-flatpak.sh prepchef.flatpak      vorhandene Datei installieren
set -eu

APP_ID=io.github.froks.PrepChef
REPO=froks/prepchef
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLATPAK_DATA="$HOME/.var/app/$APP_ID/data/prepchef"

command -v flatpak >/dev/null || { echo "✗ Flatpak ist nicht installiert (z. B. sudo apt install flatpak)."; exit 1; }

BUNDLE="${1:-}"
if [ -z "$BUNDLE" ]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  echo "▸ Suche das neueste Release von $REPO …"
  # /releases statt /releases/latest, damit auch Vorabversionen gefunden werden.
  URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=10" |
    grep -o '"browser_download_url": *"[^"]*\.flatpak"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
  [ -n "$URL" ] || { echo "✗ Kein Release mit Flatpak gefunden."; exit 1; }
  echo "▸ Lade $URL"
  BUNDLE="$TMP/$(basename "$URL")"
  curl -fL --progress-bar -o "$BUNDLE" "$URL"
fi

# Die GNOME-Laufzeit kommt von Flathub; das Bundle verweist darauf.
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
echo "▸ Installiere $BUNDLE (beim ersten Mal wird die GNOME-Laufzeit mitgeladen) …"
flatpak install --user -y --noninteractive --reinstall "$BUNDLE"

# Daten übernehmen – nur kopieren, nie überschreiben.
if [ ! -f "$FLATPAK_DATA/prepchef.db" ]; then
  for SRC in "${XDG_DATA_HOME:-$HOME/.local/share}/prepchef" "$ROOT/data"; do
    if [ -f "$SRC/prepchef.db" ]; then
      if curl -fs "http://127.0.0.1:3001/api/health" >/dev/null 2>&1; then
        echo "⚠ PrepChef läuft noch – Daten werden nicht übernommen. Beenden und das Skript erneut ausführen."
      else
        mkdir -p "$FLATPAK_DATA"
        for f in prepchef.db prepchef.db-wal prepchef.db-shm; do
          [ -f "$SRC/$f" ] && cp "$SRC/$f" "$FLATPAK_DATA/$f"
        done
        echo "▸ Daten übernommen aus $SRC"
      fi
      break
    fi
  done
fi

echo "✓ PrepChef ist installiert – Start über das Anwendungsmenü oder: flatpak run $APP_ID"
