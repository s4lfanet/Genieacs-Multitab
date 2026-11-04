#!/usr/bin/env bash
# Pasang Portal Mandiri WiFi pelanggan sebagai service systemd (butuh sudo sekali). Panduan: docs/PORTAL-WIFI.md
#
# Aman secara bawaan: portal TERPASANG tetapi NONAKTIF (portal.enabled = 'false'), tidak membuka firewall, tidak menyentuh
# GenieACS/ONT/preset. Aktifkan sendiri di Admin -> Config setelah tag nomor pelanggan terisi dan bot WA tersambung.
#   bash scripts/setup-portal.sh            # pasang
#   bash scripts/setup-portal.sh --remove   # copot service (file & Config portal.* dibiarkan)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/genieacs-bot"; U="$(id -un)"
if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now genieacs-portal 2>/dev/null || true
  sudo rm -f /etc/systemd/system/genieacs-portal.service; sudo systemctl daemon-reload
  echo "service genieacs-portal dicopot (file di $DEST dan key Config portal.* tidak dihapus)"; exit 0
fi
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
[ "$(node -p 'parseInt(process.versions.node,10)')" -ge 12 ] || { echo "ERROR: butuh Node 12+"; exit 1; }
[ -f "$DEST/wa.js" ] || { echo "ERROR: bot WA belum terpasang di $DEST (jalankan scripts/setup-wa-bot.sh dulu). Portal memakai bot WA untuk mengirim OTP."; exit 1; }
cp "$ROOT/bot/portal.js" "$ROOT/bot/portal-page.html" "$ROOT/bot/core.js" "$DEST/"
node --check "$DEST/portal.js"

MONGO="$(command -v mongosh || command -v mongo || true)"
if [ -n "$MONGO" ]; then
  JS="$(node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    console.log("var n=0;"+a.map(d=>"if(!db.config.findOne({_id:"+JSON.stringify(d._id)+"})){db.config.insertOne("+JSON.stringify(d)+");n++}").join("")+
    "db.cache.deleteMany({_id:\"ui-local-cache-hash\"});print(\"Config portal.*: \"+n+\" key ditambahkan (yang sudah ada tidak ditimpa)\")")' "$ROOT/config/portal-config.example.json")"
  "$MONGO" "${GENIEACS_DB:-genieacs}" --quiet --eval "$JS"
fi

sed -e "s#/home/USERNAME#$HOME#g" -e "s#USERNAME#$U#g" "$ROOT/bot/genieacs-portal.service" > /tmp/genieacs-portal.service
sudo install -m 644 /tmp/genieacs-portal.service /etc/systemd/system/genieacs-portal.service; rm -f /tmp/genieacs-portal.service
sudo systemctl daemon-reload; sudo systemctl enable --now genieacs-portal
# bot WA memuat core.js baru (pengirim OTP) -> restart agar outbox aktif
sudo systemctl restart genieacs-wa-bot 2>/dev/null || true
sleep 3
PORT="$("$MONGO" "${GENIEACS_DB:-genieacs}" --quiet --eval 'var c=db.config.findOne({_id:"portal.port"});print(c?String(c.value):"3020")' 2>/dev/null | tail -1 || echo 3020)"
echo "genieacs-portal: $(systemctl is-active genieacs-portal)  | port ${PORT:-3020}"
echo "Uji lokal: curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${PORT:-3020}/   (harus 200)"
echo "Portal masih NONAKTIF. Lanjut: docs/PORTAL-WIFI.md (isi tag nomor pelanggan, aktifkan portal.enabled, atur akses dari internet)."
