#!/usr/bin/env bash
# Kompatibilitas aplikasi Android "Genieacs.apk" (Alijaya) dengan GenieACS-Multitab. Panduan: docs/ANDROID-APP.md
#
# Aplikasi membaca Virtual Parameter WlanSSID, MacAddress, dan TXPower. Nilainya hanya terisi bila provision "default"
# di server men-declare VP itu. Installer sengaja TIDAK menimpa provision "default" yang sudah berjalan, jadi server
# lama perlu langkah ini (server baru dari installer sudah memilikinya).
#
# Pemakaian:
#   bash scripts/app-compat.sh             # PERIKSA SAJA: tampilkan apa yang akan berubah, tidak menulis apa pun
#   bash scripts/app-compat.sh --apply     # terapkan (backup dulu, rollback otomatis bila UI tidak sehat)
#
# Yang dilakukan --apply: (1) backup (scripts/backup.sh), (2) tambah VP WlanSSID/MacAddress/TXPower bila belum ada,
# (3) tambah 3 baris declare ke provision "default" yang sudah ada (hanya bila belum ada), (4) bersihkan cache GenieACS.
# Tidak menyentuh preset, ONT, atau VP/provision lain. Mengembalikan: bash scripts/restore.sh <folder backup yang dicetak>
#
# Variabel lingkungan: GENIEACS_DB (default genieacs), UI_URL (default http://127.0.0.1:3000/)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${GENIEACS_DB:-genieacs}"; UI_URL="${UI_URL:-http://127.0.0.1:3000/}"; APPLY=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $a (lihat --help)"; exit 2 ;;
  esac
done
MONGO="$(command -v mongo || command -v mongosh || true)"
[ -n "$MONGO" ] || { echo "ERROR: mongo / mongosh tidak ditemukan"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
ui_code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$UI_URL" || true; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
node "$ROOT/scripts/lib/app-compat.js" "$ROOT" "$TMP/run.js" "apply=$APPLY"

if [ $APPLY = 0 ]; then
  "$MONGO" "$DB" --quiet "$TMP/run.js"
  echo; echo "Ini hanya pemeriksaan. Untuk menerapkan: bash scripts/app-compat.sh --apply"
  exit 0
fi

before="$(ui_code)"
echo "   UI sebelum: HTTP $before"
if [ "$before" != "200" ]; then echo "ERROR: UI belum sehat; perbaiki dulu (rollback otomatis tidak bisa dinilai)."; exit 1; fi
command -v mongodump >/dev/null && command -v mongorestore >/dev/null || { echo "ERROR: mongodump/mongorestore dibutuhkan untuk backup & rollback"; exit 1; }
BK="$(bash "$ROOT/scripts/backup.sh")"
echo "== backup: $BK"
if ! "$MONGO" "$DB" --quiet "$TMP/run.js"; then
  echo "!! gagal -> rollback"; bash "$ROOT/scripts/restore.sh" "$BK"; exit 1
fi
sleep 4
bad=0
for i in 1 2 3 4 5 6; do c="$(ui_code)"; echo -n "UI cek $i: $c  "; [ "$c" = 200 ] || bad=1; sleep 2; done; echo
if [ $bad = 1 ]; then echo "!! UI tidak sehat -> rollback dari $BK"; bash "$ROOT/scripts/restore.sh" "$BK"; exit 1; fi
echo "Selesai. Mengembalikan bila perlu: bash scripts/restore.sh $BK"
echo "Nilai VP terisi bertahap saat tiap ONT inform berikutnya (TXPower tiap jam, WlanSSID/MacAddress tiap hari)."
