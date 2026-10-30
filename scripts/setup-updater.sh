#!/usr/bin/env bash
# Pasang layanan updater (systemd, jalan sebagai root) supaya halaman Admin -> Update bisa memeriksa & memasang
# pembaruan dari GitHub tanpa SSH. Penjelasan lengkap + model keamanan: docs/UPDATE.md
#
# Pemakaian (sebagai user biasa yang punya sudo):
#   bash scripts/setup-updater.sh                      # repo & branch bawaan
#   bash scripts/setup-updater.sh --branch feat/xxx    # branch lain (uji)
#   bash scripts/setup-updater.sh --repo URL --bot-dir /home/user/genieacs-bot --uipatch-dir /home/user/genieacs-uipatch
#   bash scripts/setup-updater.sh --remove             # hapus layanan (checkout & snapshot dibiarkan)
#
# Yang dibuat: /opt/genieacs-multitab (clone, milik root), /etc/genieacs-multitab/updater.conf,
# /var/lib/genieacs-multitab (snapshot & state), service genieacs-multitab-updater.
# Yang TIDAK disentuh: provision, preset, Config ui.*, ONT, dan program GenieACS.
set -euo pipefail
REPO="https://github.com/s4lfanet/Genieacs-Multitab.git"; BRANCH="main"; BOTDIR=""; UIPATCH=""; DB="${GENIEACS_DB:-genieacs}"; REMOVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;; --branch) BRANCH="$2"; shift 2 ;; --bot-dir) BOTDIR="$2"; shift 2 ;;
    --uipatch-dir) UIPATCH="$2"; shift 2 ;; --db) DB="$2"; shift 2 ;; --remove) REMOVE=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $1"; exit 2 ;;
  esac
done
UNIT=/etc/systemd/system/genieacs-multitab-updater.service
if [ $REMOVE = 1 ]; then
  sudo systemctl disable --now genieacs-multitab-updater 2>/dev/null || true
  sudo rm -f "$UNIT"; sudo systemctl daemon-reload
  echo "layanan dihapus. (Folder /opt/genieacs-multitab, /var/lib/genieacs-multitab, /etc/genieacs-multitab dibiarkan; hapus manual bila perlu.)"
  exit 0
fi
U="${SUDO_USER:-$(id -un)}"
HOMEDIR="$(getent passwd "$U" | cut -d: -f6)"
[ -n "$UIPATCH" ] || UIPATCH="$HOMEDIR/genieacs-uipatch"
if [ -z "$BOTDIR" ] && [ -f "$HOMEDIR/genieacs-bot/wa.js" ]; then BOTDIR="$HOMEDIR/genieacs-bot"; fi
for c in git node systemctl; do command -v "$c" >/dev/null || { echo "ERROR: $c tidak ditemukan"; exit 1; }; done
command -v mongo >/dev/null || command -v mongosh >/dev/null || { echo "ERROR: shell mongo/mongosh tidak ditemukan"; exit 1; }
[ -d "$UIPATCH/orig" ] || echo "PERINGATAN: $UIPATCH/orig belum ada. Pasang dulu menu: bash scripts/ui-admin-menu.sh --all (salinan asli bundle disimpan di situ)."
NODE="$(command -v node)"
echo "Repo : $REPO @ $BRANCH"
echo "Bot  : ${BOTDIR:-(tidak ada; update bot WA dinonaktifkan)}"
echo "Patch: $UIPATCH"

sudo mkdir -p /etc/genieacs-multitab /var/lib/genieacs-multitab /opt
sudo chmod 700 /var/lib/genieacs-multitab
if [ ! -d /opt/genieacs-multitab/.git ]; then
  sudo git clone --quiet --branch "$BRANCH" "$REPO" /opt/genieacs-multitab
else
  sudo git -C /opt/genieacs-multitab fetch --quiet origin "$BRANCH"
  sudo git -C /opt/genieacs-multitab checkout --quiet "$BRANCH"
  sudo git -C /opt/genieacs-multitab merge --quiet --ff-only "origin/$BRANCH"
fi
[ -f /opt/genieacs-multitab/scripts/updater.js ] || { echo "ERROR: branch '$BRANCH' belum berisi scripts/updater.js"; exit 1; }

node -e '
const a = process.argv.slice(1);
const c = {repo: a[0], branch: a[1], dir: "/opt/genieacs-multitab", state: "/var/lib/genieacs-multitab", db: a[2], uipatch: a[3], botdir: a[4],
  waService: "genieacs-wa-bot", uiUrl: "http://127.0.0.1:3000/", pollSeconds: 8, autoCheckHours: 6};
console.log(JSON.stringify(c, null, 2));' "$REPO" "$BRANCH" "$DB" "$UIPATCH" "$BOTDIR" | sudo tee /etc/genieacs-multitab/updater.conf >/dev/null
sudo chmod 644 /etc/genieacs-multitab/updater.conf

sudo tee "$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=GenieACS Multitab updater (halaman Admin -> Update)
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=simple
User=root
Environment=HOME=/root
ExecStart=$NODE /opt/genieacs-multitab/scripts/updater.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF
sudo systemctl daemon-reload
sudo systemctl enable --now genieacs-multitab-updater
sleep 4
systemctl --no-pager status genieacs-multitab-updater | head -5 || true
echo
echo "Selesai. Pasang/aktifkan menu & halaman Update:   bash scripts/ui-admin-menu.sh --all   (lalu Ctrl+F5, Admin -> Update)"
echo "Log layanan: journalctl -u genieacs-multitab-updater -f"
