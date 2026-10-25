#!/usr/bin/env bash
# Pasang bot WhatsApp (Baileys) sebagai service systemd (butuh sudo sekali).
#
# PENTING -- baca sebelum lanjut:
# - Baileys (library WhatsApp tidak resmi) butuh Node.js 20+. Kalau GenieACS/bot Telegram Anda
#   masih di Node 18 (umum), skrip ini memasang Node 20 TERPISAH di /opt/node20 tanpa
#   mengubah "node" sistem sama sekali -- GenieACS dan bot Telegram tidak kesentuh.
# - Login WhatsApp lewat SCAN QR CODE, bukan token. QR muncul di terminal saat servicenya
#   pertama kali jalan (lihat log dengan `journalctl -u genieacs-wa-bot -f`).
# - Sesi login tersimpan di bot/wa_auth/ -- backup folder ini kalau mau pindah server tanpa
#   scan ulang. Hapus folder ini untuk logout paksa.
# - Baileys memakai protokol WhatsApp tidak resmi: ada risiko nomor diblokir WhatsApp/Meta
#   sewaktu-waktu. Jangan pakai nomor WhatsApp pribadi/penting untuk ini -- pakai nomor khusus.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/genieacs-bot"
U="$(id -un)"
NODE20=/opt/node20/bin/node
NPM_CLI="$(dirname "$(dirname "$NODE20")")/lib/node_modules/npm/bin/npm-cli.js"
# PATH diarahkan ke /opt/node20/bin dulu: paket Baileys punya skrip postinstall yang memanggil
# "node" polos (ikut PATH shell), bukan lewat binary yang kita tunjuk -- tanpa ini skrip itu
# tetap menemukan node sistem (18) dan gagal walau kita jalankan npm lewat Node 20.
npm20() { PATH="/opt/node20/bin:$PATH" "$NODE20" "$NPM_CLI" "$@"; }

if [ ! -x "$NODE20" ]; then
  echo "Node 20 belum ada di /opt/node20. Pasang dulu (tidak mengganggu node sistem):"
  echo '  curl -fsSL -o /tmp/node20.tar.xz https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz'
  echo '  sudo mkdir -p /opt/node20 && sudo tar xJf /tmp/node20.tar.xz -C /opt/node20 --strip-components=1'
  exit 1
fi
echo "Node untuk bot WA: $("$NODE20" -v) (terpisah dari node sistem: $(command -v node >/dev/null && node -v || echo '-'))"

mkdir -p "$DEST"
cp "$ROOT/bot/wa.js" "$ROOT/bot/core.js" "$ROOT/bot/wa-page.html" "$ROOT/bot/package.json" "$DEST/"

echo "Memasang dependensi npm (sekali saja, perlu internet)..."
(cd "$DEST" && npm20 install --omit=dev --no-audit --no-fund)

CHECK="$(cd "$DEST" && "$NODE20" -e 'try{require("@whiskeysockets/baileys");console.log("ok")}catch(e){console.log("GAGAL: "+e.message)}')"
echo "Cek modul Baileys: $CHECK"
[ "$CHECK" = "ok" ] || { echo "ERROR: instalasi npm gagal, lihat pesan di atas"; exit 1; }

# Halaman scan QR memakai secret JWT GenieACS UI (supaya hanya admin yang sudah login GenieACS
# bisa membukanya). Cari file env yang dipakai service genieacs-ui.
ENVF="$(systemctl show genieacs-ui -p EnvironmentFiles --value 2>/dev/null | awk '{print $1}')"
[ -n "$ENVF" ] || ENVF=/opt/genieacs/genieacs.env
if sudo grep -q '^GENIEACS_UI_JWT_SECRET=' "$ENVF" 2>/dev/null; then
  echo "Secret JWT GenieACS: $ENVF"
else
  echo "PERINGATAN: GENIEACS_UI_JWT_SECRET tidak ditemukan di $ENVF -- halaman scan QR web tidak aktif"
  echo "  (QR tetap bisa dilihat lewat: journalctl -u genieacs-wa-bot -f). Lihat docs/WHATSAPP-BOT.md."
fi

# Key wabot.* di Admin -> Config (hanya ditambahkan kalau belum ada; nilai yang sudah diisi tidak ditimpa)
MONGO="$(command -v mongosh || command -v mongo || true)"
if [ -n "$MONGO" ]; then
  JS="$(node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    console.log("var n=0;"+a.map(d=>"if(!db.config.findOne({_id:"+JSON.stringify(d._id)+"})){db.config.insertOne("+JSON.stringify(d)+");n++}").join("")+
    "db.cache.deleteMany({_id:\"ui-local-cache-hash\"});print(\"Config wabot.*: \"+n+\" key ditambahkan\")")' "$ROOT/config/wabot-config.example.json")"
  "$MONGO" "${GENIEACS_DB:-genieacs}" --quiet --eval "$JS"
fi

PORT=3010
sed -e "s#/home/USERNAME#$HOME#g" -e "s#USERNAME#$U#g" -e "s#/opt/node20/bin/node#$NODE20#" \
  -e "s#^EnvironmentFile=-.*#EnvironmentFile=-$ENVF#" \
  "$ROOT/bot/genieacs-wa-bot.service" > /tmp/genieacs-wa-bot.service
sudo install -m 644 /tmp/genieacs-wa-bot.service /etc/systemd/system/genieacs-wa-bot.service
rm -f /tmp/genieacs-wa-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now genieacs-wa-bot

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow $PORT/tcp comment 'GenieACS bot WA - halaman scan QR' >/dev/null && echo "ufw: port $PORT dibuka"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Bot WA berjalan. Scan QR dari browser (login GenieACS dulu di alamat yang sama):"
echo "  http://${IP:-IP-SERVER}:$PORT/"
echo
echo "Setelah tersambung, aktifkan wabot.enabled='true' dan isi wabot.allowedNumbers"
echo "di GenieACS Admin -> Config (format: 62812xxxxxxx, tanpa +)."
