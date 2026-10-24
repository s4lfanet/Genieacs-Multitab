# Bot Telegram GenieACS

`bot/bot.js` adalah bot Telegram satu file: Node 12+, tanpa npm. Bot memakai NBI GenieACS (`127.0.0.1:7557`). Pengaturannya dibaca dari **Admin → Config** (`bot.*`) dan dibaca ulang setiap loop, jadi tidak perlu restart setelah mengubah setting.

## Perintah

| Perintah | Fungsi |
|---|---|
| `/cek <kata kunci>` | Detail 1 ONT: status, sinyal, WAN, SSID, fault |
| `/cari <kata>` | Daftar ONT yang cocok (maks 20) |
| `/ssid <kata kunci>` | Daftar SSID (aktif & nonaktif) + nomornya |
| `/ubahssid <kata kunci> <nomor> <nama baru>` | Ganti nama SSID * |
| `/ubahpass <kata kunci> <nomor> <password baru>` | Ganti password WiFi * (pesan berisi password dihapus dari chat) |
| `/refresh <kata kunci>` | Ambil data terbaru dari ONT (seperti Summon) * |
| `/reboot <kata kunci>` | Restart ONT * |
| `/offline` | ONT yang tidak inform > 15 menit |
| `/redaman [batas]` | ONT dengan RX di bawah batas (default -25 dBm) |
| `/status` | Ringkasan GenieACS |
| `/fault` | Fault terbaru |
| `/tanya <pertanyaan>` | Asisten AI (hanya membaca data) |
| `/id` | Chat ID Anda |

Kata kunci bisa berupa username PPPoE (lengkap/sebagian), SN ONT, IP PPPoE/TR-069, atau ID device. Pesan tanpa perintah dianggap `/cek`.

\* Perintah aksi hanya aktif kalau `bot.actions.enabled = 'true'`, dan selalu minta **konfirmasi tombol** (berlaku 5 menit).

Alert otomatis: bot mengirim pesan ke `bot.alert.chatIds` kalau jumlah fault melewati `bot.alert.faultThreshold`, dicek tiap `bot.alert.everyMinutes` menit.

## Pasang

1. Buat bot di **@BotFather** dan simpan tokennya.
2. Tambahkan key contoh: `bash scripts/install.sh --no-ui --no-vp --no-provisions --bot-config`, atau buat manual di Admin → Config.
3. Isi di **Admin → Config**:

| Key | Contoh |
|---|---|
| `bot.enabled` | `'true'` |
| `bot.telegram.token` | `'123456:ABC...'` |
| `bot.telegram.allowedChatIds` | `'123456789, 987654321'` (kosong = semua ditolak) |
| `bot.alert.chatIds` | `'123456789'` |
| `bot.alert.everyMinutes` / `bot.alert.faultThreshold` | `10` / `20` |
| `bot.actions.enabled` | `'false'` (ubah ke `'true'` untuk ubah SSID/password/reboot) |
| `bot.ai.enabled` / `bot.ai.apiKey` / `bot.ai.model` / `bot.ai.dailyLimit` | `'false'` / `''` / `'claude-opus-5-5'` / `50` |

4. Pasang service: `bash scripts/setup-bot.sh` (butuh sudo sekali, dan service berjalan sebagai user Anda).
5. Kirim `/id` ke bot, masukkan chat ID Anda ke `bot.telegram.allowedChatIds`, lalu coba `/status`.

Uji tanpa Telegram:
```bash
node ~/genieacs-bot/bot.js --selftest config
node ~/genieacs-bot/bot.js --selftest status
node ~/genieacs-bot/bot.js --selftest cek <kata kunci>
```
Log: `journalctl -u genieacs-bot -f`

Bot membaca Config lewat perintah `mongo`. Kalau server hanya punya `mongosh`, buat symlink: `sudo ln -s $(command -v mongosh) /usr/local/bin/mongo`.

## Asisten AI (`/tanya`)

Memakai Claude API (Anthropic) dengan **tool hanya-baca**: cari ONT, detail ONT, baca parameter, log ONT, daftar fault, ringkasan status, ONT offline, ONT redaman buruk, dan laporan remote web. AI tidak bisa mengubah apa pun. Nilai sensitif seperti password/key/PSK disembunyikan sebelum dikirim ke AI.

- API key dibuat di <https://console.anthropic.com> (tagihan terpisah dari langganan Claude.ai).
- Isi `bot.ai.apiKey`, lalu set `bot.ai.enabled = 'true'`.
- `bot.ai.dailyLimit` membatasi jumlah pertanyaan per hari.

## Keamanan

- Hanya chat ID terdaftar yang dilayani.
- Aksi selalu lewat konfirmasi dan dicatat di `~/genieacs-bot/audit.log`.
- Simpan token hanya di Config server, jangan di repo.
