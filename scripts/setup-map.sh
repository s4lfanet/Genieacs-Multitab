#!/usr/bin/env bash
# Pasang peta pelanggan & ODP sebagai service systemd (butuh sudo sekali).
# Hanya listen di 127.0.0.1:7570 secara default. Tidak menyentuh GenieACS, MongoDB, atau ONT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/genieacs-map"
U="$(id -un)"
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
mkdir -p "$DEST"
cp "$ROOT/map/map.js" "$ROOT/map/peta.html" "$DEST/"
if [ ! -f "$DEST/config.json" ]; then
  (cd "$DEST" && node map.js --init)
else
  echo "config.json sudah ada, password lama dipertahankan"
fi
chmod 600 "$DEST/config.json"

sed -e "s#/home/USERNAME#$HOME#g" -e "s#USERNAME#$U#g" -e "s#/usr/bin/node#$(command -v node)#" \
  "$ROOT/map/genieacs-map.service" > /tmp/genieacs-map.service
sudo install -m 644 /tmp/genieacs-map.service /etc/systemd/system/genieacs-map.service
rm -f /tmp/genieacs-map.service
sudo systemctl daemon-reload
sudo systemctl enable --now genieacs-map
sleep 2
systemctl --no-pager status genieacs-map | head -5
echo "Buka dari PC Anda: ssh -L 7570:127.0.0.1:7570 $U@<server>  lalu http://127.0.0.1:7570/"
echo "Log: journalctl -u genieacs-map -f"
