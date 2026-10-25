#!/bin/sh
# Installiert das PrepChef-AppImage für den aktuellen Benutzer: nach ~/.local/bin/prepchef, mit Eintrag im
# Anwendungsmenü. Übernimmt beim ersten Mal die Datenbank aus dem Repository (data/prepchef.db).
#
#   sh scripts/install-linux.sh                         baut das AppImage und installiert es
#   sh scripts/install-linux.sh PrepChef.AppImage       installiert ein heruntergeladenes AppImage
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DATA="$DATA_HOME/prepchef"

APPIMAGE="${1:-}"
if [ -z "$APPIMAGE" ]; then
  echo "▸ Baue PrepChef …"
  (cd "$ROOT" && bun run package)
  APPIMAGE=$(ls -t "$ROOT"/dist/prepchef-*-linux-*.AppImage | head -1)
fi

install -Dm755 "$APPIMAGE" "$BIN_DIR/prepchef"
install -Dm644 "$ROOT/desktop/build/icon.png" "$DATA_HOME/icons/hicolor/512x512/apps/prepchef.png"
install -Dm644 "$ROOT/client/public/icon.svg" "$DATA_HOME/icons/hicolor/scalable/apps/prepchef.svg"
mkdir -p "$DATA_HOME/applications"
cat > "$DATA_HOME/applications/prepchef.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=PrepChef
GenericName=Meal-Prep-Planer
Comment=Wochenpläne, Einkaufslisten und Kochtag-Ablauf fürs Meal-Prep
Exec=$BIN_DIR/prepchef %U
Icon=prepchef
StartupWMClass=prepchef
Terminal=false
Categories=Utility;
Keywords=Meal Prep;Rezepte;Einkaufsliste;Kochen;
DESKTOP
update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1 || true

# Bestehende Daten aus dem Entwicklungsbetrieb übernehmen (nur kopieren, das Original bleibt).
# Daten einer früheren Flatpak-Installation übernimmt die App beim ersten Start selbst.
if [ -f "$ROOT/data/prepchef.db" ] && [ ! -f "$APP_DATA/prepchef.db" ]; then
  if curl -fs "http://127.0.0.1:3001/api/health" >/dev/null 2>&1 || pgrep -x prepchef >/dev/null 2>&1; then
    echo "⚠ PrepChef läuft noch – Datenbank wird nicht übernommen. Beenden und das Skript erneut ausführen."
  else
    mkdir -p "$APP_DATA"
    for f in prepchef.db prepchef.db-wal prepchef.db-shm; do
      [ -f "$ROOT/data/$f" ] && cp "$ROOT/data/$f" "$APP_DATA/$f"
    done
    echo "▸ Datenbank übernommen nach $APP_DATA"
  fi
fi

echo "✓ PrepChef installiert: $BIN_DIR/prepchef"
echo "  Starten über das Anwendungsmenü oder mit: prepchef"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "  Hinweis: $BIN_DIR ist nicht im PATH – im Terminal mit $BIN_DIR/prepchef starten." ;;
esac
