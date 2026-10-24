#!/usr/bin/env bash
# Pasang sinkron branding (logo dari Admin -> Files, judul/warna dari Admin -> Config branding.*).
# - Menyalin branding/branding.js ke ~/genieacs-branding
# - SUDO sekali: memberi user ini izin tulis ke 2 file UI GenieACS (logo-*.svg dan app-*.css)
# - Menambah cron tiap menit (hanya menulis bila ada perubahan)
# Batal / kembali ke tampilan asli:  node ~/genieacs-branding/branding.js restore  lalu hapus baris cron-nya.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/genieacs-branding"
mkdir -p "$DEST"
cp "$ROOT/branding/branding.js" "$DEST/branding.js"

PUB="${GENIEACS_PUBLIC:-$(node -e 'const fs=require("fs");console.log(["/usr/local/lib/node_modules/genieacs/public","/usr/lib/node_modules/genieacs/public","/opt/genieacs/dist/public"].find(p=>fs.existsSync(p))||"")')}"
[ -n "$PUB" ] || { echo "ERROR: folder public GenieACS tidak ditemukan. Set GENIEACS_PUBLIC=/path/ke/genieacs/public"; exit 1; }
LOGO="$(ls "$PUB"/logo-*.svg)"; CSS="$(ls "$PUB"/app-*.css)"
echo "public: $PUB"
echo "file  : $LOGO"
echo "        $CSS"
echo "Memberi izin tulis ke 2 file di atas untuk user $(id -un) (butuh sudo)..."
sudo chown "$(id -un)" "$LOGO" "$CSS"

GENIEACS_PUBLIC="$PUB" node "$DEST/branding.js"
LINE="* * * * * GENIEACS_PUBLIC=$PUB $(command -v node) $DEST/branding.js >> $DEST/log.txt 2>&1"
if crontab -l 2>/dev/null | grep -q "genieacs-branding/branding.js"; then
  echo "cron sudah ada"
else
  (crontab -l 2>/dev/null; echo "$LINE") | crontab -
  echo "cron ditambahkan: $LINE"
fi
echo "Selesai. Upload logo di Admin -> Files (nama logo.png), isi branding.title di Admin -> Config, tunggu 1 menit, Ctrl+F5."
