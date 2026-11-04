#!/usr/bin/env bash
# Pasang penjaga akses NBI (service root kecil) + halaman Admin -> "Akses NBI". Panduan: docs/NBI-GUARD.md
#
# Aman: tidak mengubah aturan firewall yang SUDAH ada. Saat pertama jalan, layanan membaca firewall yang terpasang
# (scripts/nbi-firewall.sh) dan mengimpornya ke halaman; perubahan baru dilakukan dari halaman itu.
#   bash scripts/setup-nbi-guard.sh            # pasang / perbarui (butuh sudo)
#   bash scripts/setup-nbi-guard.sh --remove   # copot layanan penjaga (firewall yang sedang aktif DIBIARKAN)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB=/usr/local/lib/genieacs-multitab; UNIT=genieacs-nbi-guard.service
if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now genieacs-nbi-guard 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/$UNIT" "$LIB/nbi-guard.js"; sudo systemctl daemon-reload
  echo "layanan genieacs-nbi-guard dicopot. Firewall NBI yang aktif tidak diubah (cabut dengan: sudo bash $LIB/nbi-firewall.sh --remove)."; exit 0
fi
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
command -v iptables >/dev/null || { echo "ERROR: iptables tidak ditemukan"; exit 1; }
node --check "$ROOT/scripts/nbi-guard.js" 2>/dev/null || [ "$(node -p 'parseInt(process.versions.node,10)')" -lt 12 ] || { echo "ERROR: nbi-guard.js tidak lolos cek sintaks"; exit 1; }
bash -n "$ROOT/scripts/nbi-firewall.sh"
sudo mkdir -p "$LIB"
sudo install -m 755 "$ROOT/scripts/nbi-firewall.sh" "$LIB/nbi-firewall.sh"
sudo install -m 755 "$ROOT/scripts/nbi-guard.js" "$LIB/nbi-guard.js"
NODE="$(command -v node)"
sed -e "s#/usr/bin/env node#$NODE#" "$ROOT/scripts/genieacs-nbi-guard.service" > /tmp/genieacs-nbi-guard.service
sudo install -m 644 /tmp/genieacs-nbi-guard.service "/etc/systemd/system/$UNIT"; rm -f /tmp/genieacs-nbi-guard.service
sudo systemctl daemon-reload; sudo systemctl enable --now genieacs-nbi-guard
sleep 8
echo "genieacs-nbi-guard: $(systemctl is-active genieacs-nbi-guard)"
journalctl -u genieacs-nbi-guard -n 4 --no-pager 2>/dev/null | cut -c1-200 | sed 's/^/  /' || true
echo
echo "Pasang menu: bash scripts/ui-admin-menu.sh --all --portal --nbi   (lalu Ctrl+F5 -> Admin -> Akses NBI)"
