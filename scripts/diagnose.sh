#!/usr/bin/env bash
# Audit BACA-SAJA server GenieACS + Genieacs-Multitab. Tidak mengubah apa pun (tanpa sudo, tanpa tulis).
# Jalankan di server, lalu kirim seluruh outputnya kalau butuh bantuan:
#   bash scripts/diagnose.sh
# Memeriksa: layanan, file tampilan (menu/tema/halaman), connection request (penyebab "Incorrect connection request
# credentials" saat Summon), provision/preset berbahaya, dan key Config bot.
set -u
DB="${GENIEACS_DB:-genieacs}"; UI="${UI_URL:-http://127.0.0.1:3000}"
OKN=0; WARN=0; BAD=0
ok()   { echo "  [OK] $*";  OKN=$((OKN+1)); }
warn() { echo "  [!!] $*";  WARN=$((WARN+1)); }
bad()  { echo "  [XX] $*";  BAD=$((BAD+1)); }
info() { echo "       $*"; }
MONGO="$(command -v mongosh || command -v mongo || true)"
q() { "$MONGO" "$DB" --quiet --eval "$1" 2>/dev/null | tail -n 1; }
qa() { "$MONGO" "$DB" --quiet --eval "$1" 2>/dev/null; }

echo "== 1. Sistem"
info "node: $(node -v 2>/dev/null || echo tidak-ada)  mongo: ${MONGO:-TIDAK ADA}  host: $(hostname)  waktu: $(date '+%F %T')"
[ -n "$MONGO" ] || { bad "shell mongo/mongosh tidak ditemukan; audit database dilewati"; }
for s in genieacs-ui genieacs-cwmp genieacs-nbi genieacs-fs; do
  st="$(systemctl is-active "$s" 2>/dev/null || true)"; if [ "$st" = active ]; then ok "$s aktif"; else warn "$s: ${st:-tidak ada}"; fi
done
UIBIN="$(command -v genieacs-ui || true)"
PUB=""
if [ -n "$UIBIN" ]; then R="$(readlink -f "$UIBIN")"; C="$(dirname "$(dirname "$R")")/public"; [ -d "$C" ] && PUB="$C"; fi
if [ -z "$PUB" ]; then for c in /usr/local/lib/node_modules/genieacs/public /usr/lib/node_modules/genieacs/public /opt/genieacs/dist/public; do [ -d "$c" ] && PUB="$c" && break; done; fi
info "folder public yang dipakai UI: ${PUB:-TIDAK DITEMUKAN}"
for c in /usr/local/lib/node_modules/genieacs/public /usr/lib/node_modules/genieacs/public /opt/genieacs/dist/public; do
  [ -d "$c" ] && [ "$c" != "$PUB" ] && warn "ada folder public lain: $c (jangan salah tujuan saat memasang tampilan)"
done

echo "== 2. File tampilan (menu, tema, halaman)"
if [ -n "$PUB" ]; then
  JS="$(ls "$PUB"/app-*.js 2>/dev/null | grep -v '\.map$' | head -1)"
  if [ -z "$JS" ]; then bad "app-*.js tidak ditemukan di $PUB"
  elif grep -q 'GENIEACS-MULTITAB-BOT-MENU' "$JS"; then
    ok "bundle ter-patch ($(basename "$JS"))"
    grep -q 'acs-theme-btn' "$JS" && ok "kode tema ada" || warn "kode tema belum ada (jalankan: bash scripts/ui-admin-menu.sh --all)"
    for k in botcfg wa peta odp update; do grep -q "admin/$k\"" "$JS" && info "menu '$k' ada di bundle" || info "menu '$k' TIDAK ada di bundle"; done
  else warn "bundle belum ter-patch (menu belum dipasang): bash scripts/ui-admin-menu.sh --all"; fi
  for p in bot peta wa update; do
    f="$PUB/$p.html"
    if [ ! -f "$f" ]; then
      case "$p" in update) info "$p.html: tidak ada (opsional)";; *) warn "$p.html TIDAK ADA di $PUB -> halaman menu 'kosong'/404. Jalankan: bash scripts/ui-admin-menu.sh --all";; esac
      continue
    fi
    code="$(curl -s -o /tmp/.dg_$$ -m 8 -w '%{http_code}' "$UI/$p.html" || true)"
    if [ "$code" != 200 ]; then bad "$p.html ada di disk tapi $UI/$p.html -> HTTP $code (UI bukan dari folder ini?)"
    elif grep -q 'name="acs-page"' /tmp/.dg_$$; then ok "$p.html tersaji normal (versi baru)"
    else warn "$p.html tersaji tetapi versi LAMA (tanpa penanda); jalankan ulang ui-admin-menu.sh --all"; fi
  done
  rm -f /tmp/.dg_$$
fi

if [ -n "$MONGO" ]; then
echo "== 3. Connection request (Summon / refresh)"
TOT="$(q 'print(db.devices.count())')"
PW="$(q 'print(db.devices.count({"InternetGatewayDevice.ManagementServer.ConnectionRequestPassword._value":{$nin:["",null]}}))')"
PW2="$(q 'print(db.devices.count({"Device.ManagementServer.ConnectionRequestPassword._value":{$nin:["",null]}}))')"
AUTHCFG="$(q 'print(db.config.count({_id:"cwmp.connectionRequestAuth"}))')"
info "ONT terdaftar: $TOT | password CR terisi di database: $((${PW:-0}+${PW2:-0})) | config cwmp.connectionRequestAuth: $([ "${AUTHCFG:-0}" != 0 ] && echo ada || echo tidak ada)"
PRESETS="$(qa 'db.presets.find().forEach(function(p){print(p._id+" -> "+p.configurations.map(function(c){return c.name}).join(","))})')"
echo "$PRESETS" | sed 's/^/       preset: /'
if [ "${AUTHCFG:-0}" != 0 ]; then ok "ACS memakai kredensial dari config cwmp.connectionRequestAuth"
elif [ "${TOT:-0}" -gt 0 ] && [ $((${PW:-0}+${PW2:-0})) -ge $((TOT*9/10)) ]; then ok "hampir semua ONT punya password CR di database (Summon seharusnya berfungsi)"
elif [ "${TOT:-0}" -gt 0 ]; then
  bad "ACS TIDAK tahu password connection request sebagian besar ONT ($((${PW:-0}+${PW2:-0}))/$TOT) -> Summon gagal dengan 'Incorrect connection request credentials'"
  info "Penyebab: ONT tidak membocorkan password CR saat dibaca; ACS hanya tahu kalau ia sendiri yang menyetelnya."
  info "Perbaikan aman (hanya setel user/pass CR, tidak menyentuh URL/kredensial ACS):  bash scripts/install.sh --preset-connreq"
  info "Uji dulu di 1-2 ONT: ubah precondition preset 'connreq' di Admin -> Presets menjadi DeviceID.ID = \"...\"."
fi

echo "== 4. Provision/preset berisi nilai contoh (BERBAHAYA bila aktif)"
BADP="$(qa 'db.presets.find().forEach(function(p){p.configurations.forEach(function(c){if(c.type==="provision"){var d=db.provisions.findOne({_id:c.name});if(d&&/GANTI_/.test(d.script))print(p._id+" -> "+c.name)}})})')"
if [ -n "$BADP" ]; then bad "preset aktif memakai provision yang masih berisi GANTI_ (ONT akan diberi nilai palsu):"; echo "$BADP" | sed 's/^/       /'; info "Segera perbaiki isi provision di Admin -> Provisions, atau restore: bash scripts/restore.sh backups/<waktu>"
else ok "tidak ada preset aktif yang memakai provision ber-GANTI_"; fi

echo "== 5. Config bot / tampilan"
info "key ui.*: $(q 'print(db.config.count({_id:/^ui\./}))') | bot.*: $(q 'print(db.config.count({_id:/^bot\./}))') | wabot.*: $(q 'print(db.config.count({_id:/^wabot\./}))') | update.*: $(q 'print(db.config.count({_id:/^update\./}))')"
[ "$(q 'print(db.config.count({_id:/^ui\./}))')" -gt 0 ] && ok "Config ui.* ada (tampilan multi-tab)" || warn "Config ui.* kosong: tampilan multi-tab belum dipasang (bash scripts/install.sh)"
[ "$(q 'print(db.config.count({_id:/^bot\./}))')" -gt 0 ] && info "halaman Pengaturan Bot akan menampilkan nilai yang ada" || info "bot.* belum ada: halaman Pengaturan Bot tetap tampil dengan kolom kosong (isi lalu Simpan)"
echo "== 6. Fault"
info "fault aktif: $(q 'print(db.faults.count())')"
fi

echo
echo "RINGKASAN: OK=$OKN  PERINGATAN=$WARN  MASALAH=$BAD"
