#!/usr/bin/env bash
# Akses publik GenieACS lewat Cloudflare Tunnel (opsional). Panduan + model keamanan: docs/CLOUDFLARE-TUNNEL.md
#
# Yang dipasang (butuh sudo):
#   1. cloudflared (binary resmi Cloudflare) + service `cloudflared`, token disimpan di /etc/cloudflared/token.env (0600)
#   2. proxy NBI berpassword `genieacs-nbi-proxy` di 127.0.0.1:7558 (scripts/nbi-proxy.js): NBI GenieACS tidak punya
#      autentikasi, jadi port 7557 TIDAK BOLEH diteruskan langsung ke tunnel
# Yang TIDAK disentuh: GenieACS, provision, preset, Config, ONT, port 7547/7557/7567.
#
# Persiapan di Cloudflare (Zero Trust -> Networks -> Tunnels -> Create a tunnel -> Cloudflared): salin TOKEN-nya.
# Lalu di tab "Public Hostname" tunnel itu tambahkan dua nama host (sesudah skrip ini selesai):
#     acs.domainanda.com  ->  HTTP  localhost:3000   (UI GenieACS + halaman Multitab)
#     api.domainanda.com  ->  HTTP  localhost:7558   (proxy NBI berpassword, untuk aplikasi Android)
#
# Pemakaian:
#   CF_TUNNEL_TOKEN='eyJ...' bash scripts/setup-tunnel.sh                  # token lewat env (tidak masuk riwayat shell)
#   bash scripts/setup-tunnel.sh --token 'eyJ...'                          # token lewat argumen
#   bash scripts/setup-tunnel.sh --token '...' --api-user salfa            # nama pengguna proxy NBI (bawaan: salfa)
#   NBI_PROXY_PASSWORD='sandi-panjang-12+' bash scripts/setup-tunnel.sh ...  # sandi sendiri (bawaan: dibuat acak, dicetak SEKALI)
#   bash scripts/setup-tunnel.sh --no-api --token '...'                    # hanya tunnel untuk UI, tanpa proxy NBI
#   bash scripts/setup-tunnel.sh --remove                                  # hapus kedua layanan
set -euo pipefail
TOKEN="${CF_TUNNEL_TOKEN:-}"; APIUSER="salfa"; NOAPI=0; REMOVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;; --api-user) APIUSER="$2"; shift 2 ;; --no-api) NOAPI=1; shift ;; --remove) REMOVE=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $1"; exit 2 ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_UNIT=/etc/systemd/system/cloudflared.service
PX_UNIT=/etc/systemd/system/genieacs-nbi-proxy.service
PX_LIB=/usr/local/lib/genieacs-multitab; PX_CONF=/etc/genieacs-multitab/nbi-proxy.json

if [ $REMOVE = 1 ]; then
  sudo systemctl disable --now cloudflared genieacs-nbi-proxy 2>/dev/null || true
  sudo rm -f "$CF_UNIT" "$PX_UNIT"; sudo systemctl daemon-reload
  sudo rm -rf /etc/cloudflared "$PX_CONF" "$PX_LIB/nbi-proxy.js"
  echo "layanan tunnel & proxy NBI dihapus. (Binary /usr/local/bin/cloudflared dibiarkan; hapus manual bila perlu. Hapus juga tunnel-nya di dashboard Cloudflare.)"
  exit 0
fi

[ -n "$TOKEN" ] || { echo "ERROR: token tunnel belum diisi (--token ... atau CF_TUNNEL_TOKEN=...)"; exit 2; }
case "$TOKEN" in *[!A-Za-z0-9._=-]*) echo "ERROR: token berisi karakter tak lazim; salin ulang dari dashboard Cloudflare"; exit 2 ;; esac
command -v node >/dev/null || { echo "ERROR: node tidak ditemukan"; exit 1; }
command -v systemctl >/dev/null || { echo "ERROR: butuh systemd"; exit 1; }
NODE="$(command -v node)"

# --- 1. cloudflared ---
if ! command -v cloudflared >/dev/null; then
  case "$(uname -m)" in x86_64|amd64) A=amd64 ;; aarch64|arm64) A=arm64 ;; armv7l|armv6l) A=arm ;; *) echo "ERROR: arsitektur $(uname -m) tidak dikenal"; exit 1 ;; esac
  echo "== unduh cloudflared ($A)"
  TMPF="$(mktemp)"; trap 'rm -f "$TMPF"' EXIT
  curl -fsSL -o "$TMPF" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$A"
  sudo install -m 755 "$TMPF" /usr/local/bin/cloudflared
fi
cloudflared --version | head -1

# --- 2. proxy NBI berpassword (opsional) ---
if [ $NOAPI = 0 ]; then
  echo "== proxy NBI berpassword (127.0.0.1:7558 -> 127.0.0.1:7557)"
  GEN=0; PW="${NBI_PROXY_PASSWORD:-}"
  if [ -z "$PW" ]; then PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"; GEN=1; fi
  [ ${#PW} -ge 12 ] || { echo "ERROR: sandi proxy minimal 12 karakter"; exit 2; }
  sudo mkdir -p /etc/genieacs-multitab "$PX_LIB"
  sudo install -m 644 "$ROOT/scripts/nbi-proxy.js" "$PX_LIB/nbi-proxy.js"
  GRP="$(getent group nogroup >/dev/null && echo nogroup || echo nobody)"
  printf '%s' "$PW" | "$NODE" "$ROOT/scripts/nbi-proxy.js" --make-conf "$APIUSER" | sudo tee "$PX_CONF" >/dev/null
  sudo chown root:"$GRP" "$PX_CONF"; sudo chmod 640 "$PX_CONF"
  sudo tee "$PX_UNIT" >/dev/null <<EOF
[Unit]
Description=GenieACS NBI proxy berpassword (untuk Cloudflare Tunnel)
After=network.target genieacs-nbi.service

[Service]
ExecStart=$NODE $PX_LIB/nbi-proxy.js
Environment=NBI_PROXY_CONF=$PX_CONF
User=nobody
Group=$GRP
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=150M

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload; sudo systemctl enable --now genieacs-nbi-proxy
  sleep 2
  C="$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:7558/devices?limit=1 || true)"
  [ "$C" = 401 ] && echo "proxy aktif: tanpa login -> 401 (benar)" || echo "PERINGATAN: proxy menjawab $C (harusnya 401); cek: journalctl -u genieacs-nbi-proxy"
  if [ $GEN = 1 ]; then
    echo; echo "  Pengguna proxy NBI : $APIUSER"; echo "  Sandi (dicetak SEKALI, simpan sekarang): $PW"; echo
  fi
fi

# --- 3. service cloudflared (token di berkas 0600, bukan di unit yang bisa dibaca semua pengguna) ---
echo "== service cloudflared"
sudo mkdir -p /etc/cloudflared
printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" | sudo tee /etc/cloudflared/token.env >/dev/null; sudo chmod 600 /etc/cloudflared/token.env
sudo tee "$CF_UNIT" >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel (akses publik GenieACS)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/cloudflared/token.env
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --protocol http2 tunnel run
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload; sudo systemctl enable --now cloudflared
sleep 4
systemctl is-active cloudflared >/dev/null && echo "cloudflared aktif" || echo "PERINGATAN: cloudflared tidak aktif; cek: journalctl -u cloudflared -n 30"

cat <<'EOF'

Selesai di server. Langkah terakhir di dashboard Cloudflare (tab "Public Hostname" tunnel ini):
    acs.domainanda.com  ->  HTTP  localhost:3000
    api.domainanda.com  ->  HTTP  localhost:7558     (lewati bila memakai --no-api)
Lalu (disarankan) lindungi acs.domainanda.com dengan Cloudflare Access (Zero Trust -> Access -> Applications).
JANGAN arahkan host mana pun ke localhost:7557 (NBI tanpa autentikasi), 7547 (CWMP) atau 7567 (FS).
Status layanan terlihat di Admin -> Status (bagian layanan pendukung: cloudflared, genieacs-nbi-proxy).
EOF
