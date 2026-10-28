#!/usr/bin/env bash
# Menu di sidebar Admin GenieACS:
#   "🤖 Bot"  -> halaman bot WhatsApp (QR & status, port 3010)
#   "🗺 Peta" + "📡 ODP" -> peta pelanggan & ODP, halaman /peta.html di GenieACS itu sendiri (docs/MAP.md)
#
# Pemakaian:
#   bash scripts/ui-admin-menu.sh            # menu Bot saja (port 3010)
#   bash scripts/ui-admin-menu.sh 3010       # menu Bot, port lain
#   bash scripts/ui-admin-menu.sh --all      # SEMUA di port GenieACS: menu 🤖 Bot (pengaturan), 🗺 Peta, 📡 ODP + tema gelap
#   bash scripts/ui-admin-menu.sh --map      # hanya Peta + ODP
#   bash scripts/ui-admin-menu.sh --wapage   # hanya halaman 📱 Bot WA (status & scan QR lewat Config)
#   bash scripts/ui-admin-menu.sh --botpage  # hanya halaman 🤖 Bot (pengaturan bot di Admin -> Config)
#   bash scripts/ui-admin-menu.sh --theme    # hanya tombol tema gelap/terang
#   (opsi bisa digabung; --bot / --bot=PORT = menu Bot lama berupa iframe ke port QR WA, perlu port itu terjangkau)
#   bash scripts/ui-admin-menu.sh --remove   # kembalikan file asli (menghapus semua menu)
# Menjalankan ulang menggantikan set menu sebelumnya (selalu dibangun dari salinan asli).
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
  sudo rm -f "$PUB/peta.html" "$PUB/bot.html" "$PUB/wa.html"
  echo "menu dihapus (file asli dikembalikan; data peta di Config 'peta.data' tidak dihapus)"; ui_ok || true
  exit 0
fi

BOT=0; MAP=0; BOTPAGE=0; THEME=0; WAPAGE=0
if [ $# -eq 0 ]; then BOT=3010; fi
for a in "$@"; do
  case "$a" in
    --bot) BOT=3010 ;; --bot=*) BOT="${a#--bot=}" ;;
    --map) MAP=1 ;;
    --botpage) BOTPAGE=1 ;;
    --theme) THEME=1 ;;
    --wapage) WAPAGE=1 ;;
    --all) MAP=1; BOTPAGE=1; THEME=1; WAPAGE=1 ;;
    [0-9]*) BOT="$a" ;;
    *) echo "Opsi tidak dikenal: $a"; exit 2 ;;
  esac
done
TMP="$(mktemp --suffix=.mjs)"; trap 'rm -f "$TMP"' EXIT
node "$ROOT/scripts/lib/ui-admin-menu.js" "$BK" "$TMP" "$BOT" "$MAP" "$BOTPAGE" "$THEME" "$WAPAGE"
# pastikan JS hasil patch tetap valid (.mjs: bundle GenieACS adalah modul ES).
# Node < 14 tidak bisa memeriksa sintaks bundle (optional chaining dst). Di situ pengecekan dilewati HANYA bila
# bundle sumbernya persis bundle GenieACS 1.2.13 (md5 di bawah) yang hasil patch-nya sudah divalidasi di Node baru.
if [ "$(node -p 'parseInt(process.versions.node,10)')" -ge 14 ]; then
  node --check "$TMP"
elif [ "$(md5sum "$BK" | cut -c1-32)" = "6d764d1e119d90be9ca377907b0b654b" ]; then
  echo "Node < 14: cek sintaks dilewati (bundle = GenieACS 1.2.13 yang sudah divalidasi)"
else
  echo "ERROR: Node < 14 tidak bisa memeriksa hasil patch dan bundle ini bukan 1.2.13 yang dikenal. Pakai Node 14+."; exit 1
fi
if [ "$MAP" != 0 ]; then sudo install -m 644 "$ROOT/map/peta.html" "$PUB/peta.html"; fi
if [ "$BOTPAGE" != 0 ]; then sudo install -m 644 "$ROOT/map/bot.html" "$PUB/bot.html"; fi
if [ "$WAPAGE" != 0 ]; then sudo install -m 644 "$ROOT/map/wa.html" "$PUB/wa.html"; fi
sudo install -m 644 "$TMP" "$JS"
if ! ui_ok; then echo "!! UI tidak sehat -> kembalikan file asli"; sudo install -m 644 "$BK" "$JS"; sudo rm -f "$PUB/peta.html" "$PUB/bot.html" "$PUB/wa.html"; exit 1; fi
echo "Selesai. Buka GenieACS, tekan Ctrl+F5, lalu Admin -> menu baru di sidebar (📱 Bot WA, 🤖 Bot, 🗺 Peta, 📡 ODP) dan tombol tema di pojok kanan bawah."
