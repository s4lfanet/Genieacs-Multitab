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
cp "$ROOT/bot/wa.js" "$ROOT/bot/core.js" "$ROOT/bot/package.json" "$DEST/"

echo "Memasang dependensi npm (sekali saja, perlu internet)..."
(cd "$DEST" && npm20 install --omit=dev --no-audit --no-fund)

CHECK="$(cd "$DEST" && "$NODE20" -e 'try{require("@whiskeysockets/baileys");console.log("ok")}catch(e){console.log("GAGAL: "+e.message)}')"
echo "Cek modul Baileys: $CHECK"
[ "$CHECK" = "ok" ] || { echo "ERROR: instalasi npm gagal, lihat pesan di atas"; exit 1; }

sed -e "s#/home/USERNAME#$HOME#g" -e "s#USERNAME#$U#g" -e "s#/opt/node20/bin/node#$NODE20#" \
  "$ROOT/bot/genieacs-wa-bot.service" > /tmp/genieacs-wa-bot.service
sudo install -m 644 /tmp/genieacs-wa-bot.service /etc/systemd/system/genieacs-wa-bot.service
rm -f /tmp/genieacs-wa-bot.service
sudo systemctl daemon-reload
sudo systemctl enable genieacs-wa-bot

echo
echo "Belum dijalankan otomatis -- jalankan manual dulu untuk scan QR:"
echo "  sudo systemctl start genieacs-wa-bot"
echo "  journalctl -u genieacs-wa-bot -f      # QR muncul di sini, scan dari HP"
echo
echo "Setelah scan berhasil (sekali saja), aktifkan wabot.enabled='true' dan isi"
echo "wabot.allowedNumbers di GenieACS Admin -> Config (format: 62812xxxxxxx, tanpa +)."
