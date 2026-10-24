#!/usr/bin/env bash
# Pasang bot Telegram sebagai service systemd (butuh sudo sekali).
# Sebelumnya: buat bot di @BotFather, lalu isi bot.telegram.token & bot.telegram.allowedChatIds
# di GenieACS Admin -> Config (atau jalankan install.sh --bot-config untuk membuat key contohnya).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/genieacs-bot"
U="$(id -un)"
command -v mongo >/dev/null || echo "PERINGATAN: bot membaca Config lewat perintah 'mongo'. Jika hanya ada mongosh, buat symlink: sudo ln -s \$(command -v mongosh) /usr/local/bin/mongo"
mkdir -p "$DEST"
cp "$ROOT/bot/bot.js" "$DEST/bot.js"
[ -f "$DEST/config.json" ] || cp "$ROOT/bot/config.example.json" "$DEST/config.json"
chmod 600 "$DEST/config.json"

node "$DEST/bot.js" --selftest config || true

sed -e "s#/home/USERNAME#$HOME#g" -e "s#USERNAME#$U#g" -e "s#/usr/bin/node#$(command -v node)#" \
  "$ROOT/bot/genieacs-bot.service" > /tmp/genieacs-bot.service
sudo install -m 644 /tmp/genieacs-bot.service /etc/systemd/system/genieacs-bot.service
rm -f /tmp/genieacs-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now genieacs-bot
sleep 3
systemctl --no-pager status genieacs-bot | head -5
echo "Log: journalctl -u genieacs-bot -f"
