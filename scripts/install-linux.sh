#!/bin/sh
# Installiert PrepChef für den aktuellen Benutzer: Programm nach ~/.local/bin, Eintrag im Anwendungsmenü,
# und übernimmt beim ersten Mal die Datenbank aus dem Repository (data/prepchef.db).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DATA="$DATA_HOME/prepchef"

echo "▸ Baue PrepChef …"
(cd "$ROOT" && bun run package)

install -Dm755 "$ROOT/dist/prepchef" "$BIN_DIR/prepchef"
install -Dm644 "$ROOT/client/public/icon.svg" "$DATA_HOME/icons/hicolor/scalable/apps/prepchef.svg"
mkdir -p "$DATA_HOME/applications"
cat > "$DATA_HOME/applications/prepchef.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=PrepChef
GenericName=Meal-Prep-Planer
Comment=Wochenpläne, Einkaufslisten und Kochtag-Ablauf fürs Meal-Prep
Exec=$BIN_DIR/prepchef
Icon=prepchef
Terminal=false
Categories=Utility;
Keywords=Meal Prep;Rezepte;Einkaufsliste;Kochen;
DESKTOP
update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1 || true

# Bestehende Daten aus dem Entwicklungsbetrieb übernehmen (nur kopieren, das Original bleibt).
if [ -f "$ROOT/data/prepchef.db" ] && [ ! -f "$APP_DATA/prepchef.db" ]; then
  if curl -fs "http://127.0.0.1:3001/api/health" >/dev/null 2>&1; then
    echo "⚠ Ein PrepChef-Server läuft noch auf Port 3001 – Datenbank wird nicht übernommen."
    echo "  Server beenden und das Skript erneut ausführen, um sie zu übernehmen."
  else
    mkdir -p "$APP_DATA"
    for f in prepchef.db prepchef.db-wal prepchef.db-shm; do
      [ -f "$ROOT/data/$f" ] && cp "$ROOT/data/$f" "$APP_DATA/$f"
    done
    echo "▸ Datenbank übernommen nach $APP_DATA"
  fi
fi

# Für das eigene App-Fenster wird WebKitGTK 6.0 gebraucht, sonst öffnet PrepChef den Browser.
if ! ldconfig -p 2>/dev/null | grep -q 'libwebkitgtk-6.0.so.4'; then
  echo "⚠ WebKitGTK fehlt – PrepChef öffnet sich dann im Browser statt im eigenen Fenster."
  echo "  Für das App-Fenster: sudo apt install libwebkitgtk-6.0-4   (Fedora: sudo dnf install webkitgtk6.0)"
fi

echo "✓ PrepChef installiert: $BIN_DIR/prepchef"
echo "  Starten über das Anwendungsmenü oder mit: prepchef"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "  Hinweis: $BIN_DIR ist nicht im PATH – im Terminal mit $BIN_DIR/prepchef starten." ;;
esac
