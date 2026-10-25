#!/usr/bin/env bash
# Menu "🤖 Bot" di sidebar Admin GenieACS -> membuka halaman bot WhatsApp (QR & status, port 3010).
#
# Pemakaian:
#   bash scripts/ui-admin-menu.sh            # pasang (port 3010)
#   bash scripts/ui-admin-menu.sh 3010       # port lain
#   bash scripts/ui-admin-menu.sh --remove   # kembalikan file asli
#
# Ini MENGUBAH 1 file tampilan GenieACS (public/app-*.js, butuh sudo). Program cwmp/nbi/fs/ui tidak
# diubah. Salinan asli disimpan di ~/genieacs-uipatch/orig/. Update/instal ulang GenieACS menghapus
# patch ini -- jalankan lagi script ini sesudahnya. Hanya diuji untuk GenieACS 1.2.13; versi lain
# ditolak otomatis kalau titik sisipnya tidak cocok.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_URL="${UI_URL:-http://127.0.0.1:3000/}"
PUB="${GENIEACS_PUBLIC:-$(node -e 'const fs=require("fs");console.log(["/usr/local/lib/node_modules/genieacs/public","/usr/lib/node_modules/genieacs/public","/opt/genieacs/dist/public"].find(p=>fs.existsSync(p))||"")')}"
[ -n "$PUB" ] || { echo "ERROR: folder public GenieACS tidak ditemukan. Set GENIEACS_PUBLIC=/path/ke/genieacs/public"; exit 1; }

# file JS utama yang dimuat halaman (bukan .map, bukan chunk)
JS="$(ls "$PUB"/app-*.js | grep -v '\.map$' | head -1)"
ORIG="$HOME/genieacs-uipatch/orig"
mkdir -p "$ORIG"
BK="$ORIG/$(basename "$JS")"
if [ ! -f "$BK" ]; then
  if grep -q 'GENIEACS-MULTITAB-BOT-MENU' "$JS"; then echo "ERROR: $JS sudah ter-patch tapi salinan asli tidak ada di $BK"; exit 1; fi
  cp "$JS" "$BK"; echo "salinan asli: $BK"
fi

ui_ok() { local bad=0; sleep 3; for i in 1 2 3; do c="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$UI_URL" || true)"; echo -n "UI cek $i: $c  "; [ "$c" = 200 ] || bad=1; sleep 1; done; echo; return $bad; }

if [ "${1:-}" = "--remove" ]; then
  sudo install -m 644 "$BK" "$JS"
  echo "menu Bot dihapus (file asli dikembalikan)"; ui_ok || true
  exit 0
fi

PORT="${1:-3010}"
TMP="$(mktemp --suffix=.mjs)"; trap 'rm -f "$TMP"' EXIT
node "$ROOT/scripts/lib/ui-admin-menu.js" "$BK" "$TMP" "$PORT"
node --check "$TMP"   # pastikan JS hasil patch tetap valid (.mjs: bundle GenieACS adalah modul ES)
sudo install -m 644 "$TMP" "$JS"
if ! ui_ok; then echo "!! UI tidak sehat -> kembalikan file asli"; sudo install -m 644 "$BK" "$JS"; exit 1; fi
echo "Selesai. Buka GenieACS, tekan Ctrl+F5, lalu Admin -> 🤖 Bot."
