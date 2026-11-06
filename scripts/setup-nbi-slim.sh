#!/usr/bin/env bash
# Pasang gerbang NBI untuk aplikasi Android "Genieacs.apk" (Alijaya) sebagai service systemd. Panduan: docs/NBI-SLIM.md
#
# Mengatasi aplikasi yang lambat menampilkan data dan keluar sendiri (kehabisan memori): daftar ONT 41 MB dikecilkan menjadi
# <1 MB, plus login akun UI dan pemblokiran /users. APK TIDAK diubah (tanda tangan Alijaya utuh).
#   bash scripts/setup-nbi-slim.sh            # pasang (butuh sudo); port 7560
#   bash scripts/setup-nbi-slim.sh --remove   # copot (NBI 7557 dan firewall tidak disentuh)
# Setelah itu di router teruskan port publik (mis. 798) ke 192.168.54.254:7560, dan di aplikasi isi alamat server dengan port itu.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB=/usr/local/lib/genieacs-multitab; CONF=/etc/genieacs-multitab/nbi-slim.json; UNIT=genieacs-nbi-slim.service
if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now genieacs-nbi-slim 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/$UNIT" "$LIB/nbi-slim.js"; sudo systemctl daemon-reload
  echo "layanan genieacs-nbi-slim dicopot (konfigurasi $CONF dibiarkan; NBI 7557 dan firewall tidak disentuh)."; exit 0
fi
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
[ "$(node -p 'parseInt(process.versions.node,10)')" -ge 10 ] || { echo "ERROR: butuh Node 10+"; exit 1; }
node --check "$ROOT/scripts/nbi-slim.js" 2>/dev/null || [ "$(node -p 'parseInt(process.versions.node,10)')" -lt 12 ] || { echo "ERROR: nbi-slim.js tidak lolos cek sintaks"; exit 1; }
sudo mkdir -p "$LIB" /etc/genieacs-multitab
sudo install -m 755 "$ROOT/scripts/nbi-slim.js" "$LIB/nbi-slim.js"
[ -f "$CONF" ] || echo '{"port":7560,"listen":"0.0.0.0","upstream":"http://127.0.0.1:7557","ui":"http://127.0.0.1:3000"}' | sudo tee "$CONF" >/dev/null
sudo chmod 644 "$CONF"
NODE="$(command -v node)"
sed -e "s#/usr/bin/env node#$NODE#" "$ROOT/scripts/genieacs-nbi-slim.service" > /tmp/genieacs-nbi-slim.service
sudo install -m 644 /tmp/genieacs-nbi-slim.service "/etc/systemd/system/$UNIT"; rm -f /tmp/genieacs-nbi-slim.service
sudo systemctl daemon-reload; sudo systemctl enable --now genieacs-nbi-slim
sleep 3
PORT="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).port||7560)}catch(e){console.log(7560)}' "$CONF")"
echo "genieacs-nbi-slim: $(systemctl is-active genieacs-nbi-slim) | port $PORT"
echo "Uji lokal (harus 401 tanpa login): curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$PORT/devices?limit=1"
echo "Router: teruskan port publik ke 192.168.54.254:$PORT. Aplikasi: http://<IP-PUBLIK>:<port-publik>, username/password = akun UI GenieACS."
