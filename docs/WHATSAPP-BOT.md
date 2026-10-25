# Bot WhatsApp GenieACS (opsional)

`bot/wa.js` adalah transport kedua di samping [bot Telegram](TELEGRAM-BOT.md) — perintah dan logic-nya **sama persis** (`bot/core.js` dipakai bersama). Bedanya hanya cara masuk/keluar pesan.

## ⚠️ Baca dulu sebelum pasang

- **Login lewat scan QR code**, bukan token API resmi. Baileys (library yang dipakai) meniru protokol WhatsApp Web yang tidak resmi — **ada risiko nomor diblokir WhatsApp/Meta sewaktu-waktu**, tanpa jaminan. Jangan pakai nomor WhatsApp pribadi atau nomor penting; pakai nomor khusus yang bisa direlakan kalau diblokir.
- **Butuh Node.js 20+.** Kalau GenieACS/bot Telegram Anda masih di Node 18 (umum), `scripts/setup-wa-bot.sh` memasang Node 20 **terpisah** di `/opt/node20` tanpa mengubah `node` sistem — GenieACS dan bot Telegram tidak tersentuh.
- **Dipasang lewat npm** (satu-satunya bagian repo ini yang pakai npm): `@whiskeysockets/baileys`, `@hapi/boom`, `qrcode-terminal`, hanya di folder `bot/`.
- Sesi login tersimpan di `~/genieacs-bot/wa_auth/`. **Backup folder ini** kalau mau pindah server tanpa scan ulang. Hapus folder ini untuk logout paksa.

Kalau risiko di atas tidak bisa diterima, pakai [bot Telegram](TELEGRAM-BOT.md) saja (token resmi, tidak ada risiko blokir nomor).

## Pasang

1. Node 20 terpisah (sekali saja, kalau belum ada):
   ```bash
   curl -fsSL -o /tmp/node20.tar.xz https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz
   sudo mkdir -p /opt/node20 && sudo tar xJf /tmp/node20.tar.xz -C /opt/node20 --strip-components=1
   ```
2. `bash scripts/setup-wa-bot.sh` — menyalin `wa.js`+`core.js`, `npm install` paket di atas, pasang service systemd (butuh sudo sekali), **tidak langsung dijalankan**.
3. Scan QR:
   ```bash
   sudo systemctl start genieacs-wa-bot
   journalctl -u genieacs-wa-bot -f
   ```
   QR muncul di terminal. Di HP: **WhatsApp → Perangkat Tertaut → Tautkan Perangkat**, scan. Kalau terminal tidak bisa menampilkan QR, isi mentahnya ada di `~/genieacs-bot/wa_qr.txt` (tempel ke generator QR online untuk melihatnya sebagai gambar).
4. Setelah tersambung (log `WA tersambung`), isi di **Admin → Config**:

| Key | Contoh |
|---|---|
| `wabot.enabled` | `'true'` |
| `wabot.allowedNumbers` | `'6281234567890, 6289876543210'` (format internasional tanpa `+`, kosong = semua ditolak) |
| `wabot.actions.enabled` | `'false'` (ubah ke `'true'` untuk ubah SSID/password/reboot) |
| `wabot.alert.numbers` / `wabot.alert.everyMinutes` / `wabot.alert.faultThreshold` | opsional, sama seperti `bot.alert.*` di Telegram |

Asisten AI (`/tanya`) **tidak perlu diatur ulang** — memakai `bot.ai.*` yang sama dengan bot Telegram (satu pengaturan untuk semua transport).

5. Kirim pesan ke nomor bot dari nomor yang sudah masuk `wabot.allowedNumbers`, coba `/status`.

## Perintah

Sama persis dengan [bot Telegram](TELEGRAM-BOT.md#perintah), kecuali:
- Tidak ada `/id` (pakai nomor WhatsApp Anda sendiri untuk didaftarkan admin).
- Tidak ada tombol konfirmasi. Setelah `/ubahssid`, `/ubahpass`, atau `/reboot`, bot membalas ringkasan perubahan lalu **balas pesan `ya` untuk menyetujui atau `batal` untuk membatalkan** (berlaku 5 menit, sama seperti Telegram).
- Pesan grup dan status WhatsApp diabaikan — bot hanya merespons chat pribadi.

## Uji tanpa WhatsApp

```bash
PATH=/opt/node20/bin:$PATH /opt/node20/bin/node ~/genieacs-bot/wa.js --selftest config
PATH=/opt/node20/bin:$PATH /opt/node20/bin/node ~/genieacs-bot/wa.js --selftest status
```
Log: `journalctl -u genieacs-wa-bot -f`

## Keamanan

- Hanya nomor terdaftar (`wabot.allowedNumbers`) yang dilayani.
- Aksi selalu lewat konfirmasi teks dan dicatat di `~/genieacs-bot/audit.log` (log gabungan dengan bot Telegram, ditandai `WA `).
- `wa_auth/` berisi kunci sesi WhatsApp — perlakukan seperti password, jangan commit ke git (sudah ada di `.gitignore`).
- Kalau nomor bot diblokir atau logout sendiri, hapus `wa_auth/` dan ulangi dari langkah "Scan QR" di atas.
