#!/usr/bin/env bash
# Tambah tombol "📱 Bot WA" di bar tab halaman device GenieACS, menuju halaman scan QR bot WhatsApp.
#
# Pemakaian:
#   bash scripts/wa-ui-link.sh                         # pakai IP server ini, port 3010
#   bash scripts/wa-ui-link.sh http://acs.isp.net:3010/ # alamat lain
#   bash scripts/wa-ui-link.sh --remove                # hapus tombol
#
# PENTING: pakai alamat (IP/host) yang SAMA dengan yang dipakai admin membuka GenieACS di browser.
# Halaman QR memeriksa cookie login GenieACS, dan browser hanya mengirim cookie ke host yang sama.
# Menjalankan ulang scripts/install.sh mengganti semua ui.* -- jalankan script ini lagi sesudahnya.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${GENIEACS_DB:-genieacs}"
UI_URL="${UI_URL:-http://127.0.0.1:3000/}"
MONGO="$(command -v mongosh || command -v mongo || true)"
[ -n "$MONGO" ] || { echo 'ERROR: shell mongo tidak ditemukan ("mongosh" atau "mongo")'; exit 1; }

MODE=add; URL="${1:-}"
if [ "$URL" = "--remove" ]; then MODE=remove; URL=""; fi
if [ "$MODE" = add ] && [ -z "$URL" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  URL="http://${IP}:3010/"
fi
if [ "$MODE" = add ] && ! [[ "$URL" =~ ^https?://[A-Za-z0-9._:-]+/?$ ]]; then
  echo "ERROR: URL tidak valid (contoh: http://192.168.1.10:3010/): $URL"; exit 1
fi

BK="$(bash "$ROOT/scripts/backup.sh")"
echo "backup: $BK"

"$MONGO" "$DB" --quiet --eval "
var BAR='ui.device.0.components.1', CSS=BAR+'.components.0.components.0', LINK=BAR+'.components.99';
if (!db.config.findOne({_id: BAR + '.element'})) { print('ERROR: bar tab multi-tab tidak ditemukan -- pasang dulu: bash scripts/install.sh'); quit(1); }
db.config.deleteMany({_id: {\$regex: '^' + LINK.replace(/\\./g, '\\\\.') + '\\\\.'}});
var css = db.config.findOne({_id: CSS});
var rule = '.acs-bar .acs-wa{margin-left:auto;text-decoration:none;background:#25d366;color:#fff;border-color:#1da851}';
var v = css.value.replace(/\.acs-bar \.acs-wa\{[^}]*\}/, '');
if ('$MODE' === 'add') {
  v = v.replace(/'\$/, rule + \"'\");
  db.config.insertMany([
    {_id: LINK + '.type', value: \"'a'\"},
    {_id: LINK + '.href', value: \"'$URL'\"},
    {_id: LINK + '.target', value: \"'_blank'\"},
    {_id: LINK + '.class', value: \"'acs-l acs-wa'\"},
    {_id: LINK + '.innerHTML', value: \"'📱 Bot WA'\"}
  ]);
}
db.config.updateOne({_id: CSS}, {\$set: {value: v}});
db.cache.deleteMany({_id: {\$in: ['ui-local-cache-hash']}});
print('$MODE' === 'add' ? 'tombol Bot WA -> $URL' : 'tombol Bot WA dihapus');
"

sleep 4; bad=0
for i in 1 2 3 4; do c="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$UI_URL" || true)"; echo -n "UI cek $i: $c  "; [ "$c" = 200 ] || bad=1; sleep 2; done; echo
if [ $bad = 1 ]; then echo "!! UI tidak sehat -> rollback"; bash "$ROOT/scripts/restore.sh" "$BK"; exit 1; fi
echo "Selesai. Buka halaman device mana saja di GenieACS, tekan Ctrl+F5 -- tombol hijau '📱 Bot WA' di ujung kanan bar tab."
