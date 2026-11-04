#!/usr/bin/env bash
# Batasi akses ke port NBI GenieACS (7557) hanya untuk jaringan tepercaya. Panduan: docs/ANDROID-APP.md ("Keamanan")
#
# Kenapa: NBI tidak punya login, dan GET /users mengembalikan hash PBKDF2 akun UI. Siapa pun yang menjangkau 7557
# bisa mengambil hash itu dan membaca/mengubah semua ONT.
#
# Yang dilakukan (HANYA port 7557, TIDAK menyentuh port lain, tidak mengaktifkan ufw, tidak mengubah kebijakan bawaan):
#   - chain iptables GM_NBI_7557 yang menerima: localhost, subnet jaringan server sendiri, daftar --allow, dan sambungan
#     yang SUDAH berjalan (ESTABLISHED/RELATED); selain itu dicatat (kernel log "gm-nbi-blok:") lalu ditolak (tcp-reset)
#   - service systemd genieacs-nbi-firewall (oneshot) supaya aturan kembali setelah reboot
#
# Pemakaian:
#   bash scripts/nbi-firewall.sh                       # status saja (tidak mengubah apa pun)
#   bash scripts/nbi-firewall.sh --apply               # terapkan: localhost + subnet server sendiri
#   bash scripts/nbi-firewall.sh --apply --allow 10.8.0.0/24 --allow 192.168.88.5/32     # tambah jaringan/VPN yang boleh
#   bash scripts/nbi-firewall.sh --remove              # cabut semuanya (kembali seperti semula)
#
# Pengaman: setelah --apply skrip menguji localhost dan IP server sendiri; bila gagal, aturan dicabut otomatis.
# Melihat yang diblokir: journalctl -k | grep gm-nbi-blok      (lalu tambahkan sumbernya dengan --apply --allow ...)
#
# Untuk uji pada port lain (tanpa menyentuh 7557): NBI_PORT=7599 GM_NBI_AUTO=0 bash scripts/nbi-firewall.sh --apply --no-unit
set -euo pipefail
PORT="${NBI_PORT:-7557}"; CHAIN="GM_NBI_$PORT"; AUTO="${GM_NBI_AUTO:-1}"
CONF_DIR=/etc/genieacs-multitab; ALLOW_FILE="$CONF_DIR/nbi-allow-$PORT.conf"
LIB=/usr/local/lib/genieacs-multitab; UNIT=genieacs-nbi-firewall.service
MODE=status; UNITMODE=1; ALLOW=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) MODE=apply; shift ;; --remove) MODE=remove; shift ;; --status) MODE=status; shift ;;
    --boot) MODE=boot; shift ;; --boot-stop) MODE=bootstop; shift ;; --allow) ALLOW+=("${2:?--allow butuh CIDR}"); shift 2 ;; --no-unit) UNITMODE=0; shift ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $1 (lihat --help)"; exit 2 ;;
  esac
done
if [ "$(id -u)" != 0 ]; then exec sudo -E bash "$0" "$@"; fi
command -v iptables >/dev/null || { echo "ERROR: iptables tidak ditemukan"; exit 1; }
HAS6=0; command -v ip6tables >/dev/null && HAS6=1

cidr_ok() { [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ ]] || [[ "$1" =~ ^[0-9a-fA-F:]+(/[0-9]{1,3})?$ && "$1" == *:* ]]; }
own_subnets() { ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}'; }

load_allow() { [ -f "$ALLOW_FILE" ] && grep -v '^\s*#' "$ALLOW_FILE" | grep -v '^\s*$' || true; }

build() {   # bangun ulang chain dari daftar di $@
  local c
  iptables -N "$CHAIN" 2>/dev/null || iptables -F "$CHAIN"
  iptables -A "$CHAIN" -s 127.0.0.0/8 -j RETURN
  iptables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  for c in "$@"; do [[ "$c" == *:* ]] || iptables -A "$CHAIN" -s "$c" -j RETURN; done
  iptables -A "$CHAIN" -m limit --limit 6/min --limit-burst 10 -j LOG --log-prefix "gm-nbi-blok: " --log-level 6 2>/dev/null || true
  iptables -A "$CHAIN" -p tcp -j REJECT --reject-with tcp-reset
  iptables -C INPUT -p tcp --dport "$PORT" -j "$CHAIN" 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$PORT" -j "$CHAIN"
  if [ $HAS6 = 1 ]; then
    ip6tables -N "$CHAIN" 2>/dev/null || ip6tables -F "$CHAIN"
    ip6tables -A "$CHAIN" -s ::1/128 -j RETURN
    ip6tables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
    for c in "$@"; do [[ "$c" == *:* ]] && ip6tables -A "$CHAIN" -s "$c" -j RETURN; done
    ip6tables -A "$CHAIN" -p tcp -j REJECT --reject-with tcp-reset
    ip6tables -C INPUT -p tcp --dport "$PORT" -j "$CHAIN" 2>/dev/null || ip6tables -I INPUT 1 -p tcp --dport "$PORT" -j "$CHAIN"
  fi
}

unbuild() {
  local t
  for t in iptables ip6tables; do
    command -v $t >/dev/null || continue
    while $t -D INPUT -p tcp --dport "$PORT" -j "$CHAIN" 2>/dev/null; do :; done
    $t -F "$CHAIN" 2>/dev/null || true; $t -X "$CHAIN" 2>/dev/null || true
  done
}

code() { curl -s -o /dev/null -m 6 -w '%{http_code}' "$1" 2>/dev/null || true; }

status() {
  echo "== NBI port $PORT"
  ss -Htln "( sport = :$PORT )" | sed 's/^/   listen: /' || true
  if iptables -C INPUT -p tcp --dport "$PORT" -j "$CHAIN" 2>/dev/null; then
    echo "   pembatasan: AKTIF (chain $CHAIN)"; iptables -S "$CHAIN" | sed 's/^/     /'
    echo "   diblokir 24 jam terakhir: $(journalctl -k --since -24h --no-pager 2>/dev/null | grep -c 'gm-nbi-blok' || true) paket tercatat"
  else
    echo "   pembatasan: TIDAK AKTIF (port terbuka untuk semua yang bisa menjangkau server)"
  fi
  local a; a="$(load_allow | tr '\n' ' ')"; echo "   daftar izin tersimpan: ${a:-(belum ada)}"
  echo "   jaringan server sendiri (otomatis diizinkan saat --apply): $(own_subnets | tr '\n' ' ')"
  echo "   sambungan aktif ke $PORT sekarang: $(ss -Htn state established "( sport = :$PORT )" | wc -l)"
  systemctl is-enabled "$UNIT" >/dev/null 2>&1 && echo "   service $UNIT: aktif saat boot" || echo "   service $UNIT: tidak terpasang"
}

case "$MODE" in
  status) status; echo; echo "Ini hanya status. Menerapkan: bash scripts/nbi-firewall.sh --apply"; exit 0 ;;
  boot) mapfile -t L < <(load_allow); build "${L[@]}"; exit 0 ;;
  bootstop) unbuild; exit 0 ;;
  remove)
    unbuild
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
    if [ "$PORT" = 7557 ]; then rm -f "/etc/systemd/system/$UNIT" "$LIB/nbi-firewall.sh"; systemctl daemon-reload; fi
    rm -f "$ALLOW_FILE"
    echo "pembatasan port $PORT dicabut; aturan, service, dan daftar izin dihapus."; exit 0 ;;
esac

# ---- apply ----
for c in "${ALLOW[@]}"; do cidr_ok "$c" || { echo "ERROR: CIDR tidak valid: $c"; exit 2; }; done
declare -A SEEN; LIST=()
add() { [ -n "${SEEN[$1]:-}" ] || { SEEN[$1]=1; LIST+=("$1"); }; }
while read -r c; do [ -n "$c" ] && add "$c"; done < <(load_allow)
[ "$AUTO" = 1 ] && while read -r c; do [ -n "$c" ] && add "$c"; done < <(own_subnets)
for c in "${ALLOW[@]}"; do add "$c"; done
echo "== izinkan ke port $PORT: localhost + ${LIST[*]:-(tidak ada tambahan)}"
echo "   sambungan aktif saat ini: $(ss -Htn state established "( sport = :$PORT )" | wc -l) (tetap dipertahankan)"

mkdir -p "$CONF_DIR"
{ echo "# jaringan yang boleh mengakses NBI :$PORT (satu CIDR per baris). Ubah lewat: nbi-firewall.sh --apply --allow ..."; printf '%s\n' "${LIST[@]}"; } > "$ALLOW_FILE"
build "${LIST[@]}"

# uji: localhost dan IP server sendiri harus tetap menjawab; bila tidak, cabut
ok=1
for u in "http://127.0.0.1:$PORT/"; do r="$(code "$u")"; echo "   uji $u -> $r"; [ -n "$r" ] && [ "$r" != 000 ] || ok=0; done
if [ "$AUTO" = 1 ]; then for ip in $(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1); do r="$(code "http://$ip:$PORT/")"; echo "   uji http://$ip:$PORT/ -> $r"; [ -n "$r" ] && [ "$r" != 000 ] || ok=0; done; fi
if [ $ok = 0 ]; then echo "!! uji gagal -> aturan dicabut"; unbuild; rm -f "$ALLOW_FILE"; exit 1; fi

if [ $UNITMODE = 1 ] && [ "$PORT" = 7557 ]; then
  mkdir -p "$LIB"; install -m 755 "$0" "$LIB/nbi-firewall.sh"
  cat > "/etc/systemd/system/$UNIT" <<EOF
[Unit]
Description=Batasi akses NBI GenieACS (port $PORT) ke jaringan tepercaya
After=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$LIB/nbi-firewall.sh --boot
ExecStop=$LIB/nbi-firewall.sh --boot-stop

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable "$UNIT" >/dev/null 2>&1
  echo "   service $UNIT terpasang (aturan kembali setelah reboot)"
fi
echo "Selesai. Status: bash scripts/nbi-firewall.sh | Cabut: bash scripts/nbi-firewall.sh --remove"
