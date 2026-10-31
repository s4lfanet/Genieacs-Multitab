#!/usr/bin/env bash
# Installer Genieacs-Multitab untuk GenieACS 1.2.x
#
# Yang dipasang secara default (aman, tidak mengubah setelan ONT):
#   - Tampilan UI multi-tab: semua key Config ui.* (DIGANTI seluruhnya) + branding.* (jika belum ada)
#   - Virtual Parameters (29 VP)
#   - Provisions "bootstrap" dan "default" + preset bootstrap/default (discovery + trigger
#     VirtualParameters, tidak mengubah setelan ONT).
#   - Provision yang MENGUBAH ONT (inform2, useradmin2, remoteweb, nokia_pppoe) TIDAK dipasang
#     kecuali diminta lewat --preset-* / --provision=NAME di bawah.
#
# Keamanan untuk server yang SUDAH BERJALAN: VP, provision, dan preset yang sudah ada di server dan
# isinya berbeda TIDAK ditimpa (dilaporkan sebagai "dilewati"). Pakai --overwrite hanya kalau memang
# mau menggantinya. (Dulu semua provision di repo ditimpa; di server yang sudah punya preset "inform",
# template inform2 berisi GANTI_... langsung dijalankan ke semua ONT dan memutus komunikasi/connection request.)
#
# Opsional (MENGUBAH setelan ONT, baca docs/PROVISIONS-VP.md dulu):
#   --preset-connreq    preset connreq -> connreq (HANYA user/pass connection request ONT, supaya Summon/refresh
#                       berfungsi; tidak mengubah URL/kredensial ACS. Aman, tanpa GANTI_; lihat docs/TROUBLESHOOTING.md)
#   --preset-inform     DINONAKTIFKAN SEMENTARA di installer ini. preset inform -> inform2 (menyetel URL ACS, user/pass
#                       ACS, user/pass connection request, interval ke SEMUA ONT). Ditolak kecuali GM_ENABLE_INFORM=1.
#   --preset-useradmin  preset useradmin -> useradmin2 (paksa user/password web ONT)
#   --preset-remoteweb  preset remoteweb -> remoteweb (buka web ONT dari WAN, firewall ONT dilonggarkan)
#   --provision=NAME    pasang provision yang mengubah ONT tanpa preset (mis. nokia_pppoe)
#   --bot-config        tambah key bot.* contoh ke Config (untuk bot Telegram)
#   --overwrite         timpa VP/provision/preset yang sudah ada dan berbeda (default: dilewati)
#
# Lain-lain:
#   --no-ui --no-vp --no-provisions   lewati bagian tertentu
#   --dry-run                         hanya tampilkan rencana, tidak menulis apa pun
#   --force                           tetap jalan walau UI belum menjawab 200 sebelum instal
#
# Variabel lingkungan: GENIEACS_DB (default genieacs), UI_URL (default http://127.0.0.1:3000/)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${GENIEACS_DB:-genieacs}"
UI_URL="${UI_URL:-http://127.0.0.1:3000/}"
WITH_UI=1; WITH_VP=1; WITH_PROV=1; WITH_BOT=0; DRY=0; FORCE=0; OVERWRITE=0; PRESETS=""; PROVS=""

for a in "$@"; do
  case "$a" in
    --no-ui) WITH_UI=0 ;;
    --no-vp) WITH_VP=0 ;;
    --no-provisions) WITH_PROV=0 ;;
    --preset-connreq) PRESETS="$PRESETS connreq" ;;
    --preset-inform) PRESETS="$PRESETS inform" ;;
    --preset-useradmin) PRESETS="$PRESETS useradmin" ;;
    --preset-remoteweb) PRESETS="$PRESETS remoteweb" ;;
    --provision=*) PROVS="$PROVS ${a#--provision=}" ;;
    --overwrite) OVERWRITE=1 ;;
    --bot-config) WITH_BOT=1 ;;
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $a (lihat --help)"; exit 2 ;;
  esac
done

# --- inform otomatis (inform2) DINONAKTIFKAN sementara ---
# inform2 menulis URL ACS, user/password ACS, dan user/password connection request ke semua ONT. Nilai yang salah memutus
# ONT dari ACS dan tidak bisa dipulihkan dari GenieACS, jadi tidak boleh aktif lewat installer secara tidak sengaja.
# Server yang sudah memakai preset "inform" TIDAK terpengaruh (preset/provision yang ada tidak disentuh).
# Untuk mengaktifkannya lagi dengan sadar: GM_ENABLE_INFORM=1 bash scripts/install.sh --preset-inform ...
case " $PRESETS " in *" inform "*) INFORM_REQ=1 ;; esac
case " $PROVS " in *" inform2 "*) INFORM_REQ=1 ;; esac
if [ "${INFORM_REQ:-0}" = 1 ] && [ "${GM_ENABLE_INFORM:-0}" != 1 ]; then
  echo "ERROR: inform otomatis (preset 'inform' / provision 'inform2') DINONAKTIFKAN sementara di installer."
  echo "       Ia menyetel URL ACS, user/password ACS, dan user/password connection request ke SEMUA ONT."
  echo "       Untuk hanya memperbaiki Summon (user/password connection request), pakai: --preset-connreq"
  echo "       Untuk mengaktifkan inform2 dengan sadar: GM_ENABLE_INFORM=1 bash scripts/install.sh --preset-inform"
  exit 2
fi

MONGO="$(command -v mongo || command -v mongosh || true)"
[ -n "$MONGO" ] || { echo "ERROR: mongo / mongosh tidak ditemukan"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
command -v mongodump >/dev/null && command -v mongorestore >/dev/null || { echo "ERROR: mongodump/mongorestore (mongodb-database-tools) dibutuhkan untuk backup & rollback"; exit 1; }

ui_code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$UI_URL" || true; }

# --- cek placeholder untuk semua provision yang mengubah ONT dan akan dipasang ---
for p in $PRESETS; do
  case "$p" in
    connreq) PROVS="$PROVS connreq" ;;
    inform) PROVS="$PROVS inform2" ;;
    useradmin) PROVS="$PROVS useradmin2" ;;
    remoteweb) PROVS="$PROVS remoteweb" ;;
  esac
done
for n in $PROVS; do
  f="provisions/$n.js"
  [ -f "$ROOT/$f" ] || { echo "ERROR: provision tidak ada: $f"; exit 2; }
  if grep -q "GANTI_" "$ROOT/$f"; then
    echo "ERROR: $f masih berisi nilai GANTI_... Edit dulu sesuai server Anda sebelum memasangnya:"
    grep -n "GANTI_" "$ROOT/$f"
    exit 1
  fi
done
PROVS="$(echo $PROVS | tr ' ' '\n' | sort -u | paste -sd, -)"

echo "== Genieacs-Multitab installer"
echo "   DB=$DB  UI=$UI_URL  shell=$MONGO"
echo "   UI config: $([ $WITH_UI = 1 ] && echo ya || echo tidak) | VP: $([ $WITH_VP = 1 ] && echo ya || echo tidak) | provisions: $([ $WITH_PROV = 1 ] && echo ya || echo tidak) | preset:${PRESETS:- (tidak ada)} | bot-config: $([ $WITH_BOT = 1 ] && echo ya || echo tidak)"

before="$(ui_code)"
echo "   UI sebelum instal: HTTP $before"
if [ "$before" != "200" ] && [ $FORCE = 0 ]; then
  echo "ERROR: UI belum sehat sebelum instal. Perbaiki dulu, atau pakai --force (rollback otomatis tidak bisa dinilai)."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
node "$ROOT/scripts/lib/bundle.js" "$ROOT" "$TMP/run.js" \
  "ui=$WITH_UI" "vp=$WITH_VP" "prov=$WITH_PROV" "bot=$WITH_BOT" "presets=$(echo $PRESETS | tr ' ' ',')" "provs=$PROVS" "overwrite=$OVERWRITE" "dry=$DRY"

if [ $DRY = 1 ]; then
  "$MONGO" "$DB" --quiet "$TMP/run.js"
  echo "== dry-run selesai, tidak ada yang ditulis"
  exit 0
fi

BK="$(bash "$ROOT/scripts/backup.sh")"
echo "== backup: $BK"

if ! "$MONGO" "$DB" --quiet "$TMP/run.js"; then
  echo "!! import gagal -> rollback"
  bash "$ROOT/scripts/restore.sh" "$BK"
  exit 1
fi

sleep 4
bad=0
for i in 1 2 3 4 5 6; do c="$(ui_code)"; echo -n "UI cek $i: $c  "; [ "$c" = 200 ] || bad=1; sleep 2; done; echo
if [ $bad = 1 ] && [ "$before" = 200 ]; then
  echo "!! UI tidak sehat setelah instal -> rollback dari $BK"
  bash "$ROOT/scripts/restore.sh" "$BK"
  exit 1
fi
echo "== SELESAI. Buka GenieACS, tekan Ctrl+F5, lalu buka salah satu device."
echo "   Rollback manual: bash scripts/restore.sh $BK"
