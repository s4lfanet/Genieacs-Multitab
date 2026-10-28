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
2. `bash scripts/setup-wa-bot.sh` — menyalin `wa.js`+`core.js`, `npm install` paket di atas, pasang & jalankan service systemd (butuh sudo sekali), buka port 3010 di ufw kalau ufw aktif.
3. **Scan QR dari browser** (tanpa terminal):
   - Login dulu ke GenieACS seperti biasa, misalnya `http://192.168.1.10:3000`.
   - Buka **`http://192.168.1.10:3010/`** (host/IP **sama** dengan GenieACS, port 3010).
   - Di HP: **WhatsApp → Perangkat Tertaut → Tautkan Perangkat**, arahkan ke QR.
   - Halaman **tidak** memperbarui sendiri. QR dari WhatsApp hanya berlaku ±20 detik: kalau gagal scan, klik **🔄 Refresh** untuk QR terbaru. Setelah scan, klik **🔄 Refresh** lagi untuk melihat **✅ Tersambung**.
   - Satu sesi QR berlangsung ±2–3 menit. Setelah itu bot **berhenti** membuat QR (tidak terus-menerus) dan halaman menampilkan tombol **Minta QR baru**.
   - Opsional, menu **🤖 Bot** di sidebar Admin (membuka halaman ini di dalam GenieACS): `bash scripts/ui-admin-menu.sh`. Ini mengubah 1 file tampilan GenieACS (`public/app-*.js`, butuh sudo); salinan asli disimpan di `~/genieacs-uipatch/orig/`, hapus dengan `bash scripts/ui-admin-menu.sh --remove`. Hanya diuji di GenieACS 1.2.13 — versi lain ditolak otomatis. Update/instal ulang GenieACS menghapus menu ini; jalankan script lagi sesudahnya. Menu hanya tampil untuk user yang boleh mengubah Config. Kalau GenieACS dibuka lewat HTTPS (reverse proxy), halaman port 3010 yang masih HTTP akan diblokir browser di dalam menu ini — buka `:3010` langsung.
   - Opsional, tombol pintasan hijau **📱 Bot WA** di bar tab halaman device: `bash scripts/wa-ui-link.sh` (atau `bash scripts/wa-ui-link.sh http://alamat-anda:3010/` kalau admin membuka GenieACS lewat alamat lain). Jalankan lagi sesudah `install.sh`, karena installer mengganti semua `ui.*`.

   Halaman ini **hanya terbuka untuk yang sudah login GenieACS**: browser mengirim cookie login GenieACS (`genieacs-ui-jwt`) dan bot memverifikasinya dengan `GENIEACS_UI_JWT_SECRET` yang sama (dibaca dari file env service `genieacs-ui`). Tanpa login → "Login GenieACS dulu". QR digambar di server, tidak dikirim ke layanan luar. Ini penting: siapa pun yang scan QR duluan, nomornyalah yang terhubung ke bot.

   Cadangan kalau halaman web tidak bisa dipakai: `journalctl -u genieacs-wa-bot -f` (QR tampil di terminal).
4. Setelah tersambung, isi di **Admin → Config** (key `wabot.enabled`, `wabot.allowedNumbers`, `wabot.actions.enabled` sudah dibuat otomatis oleh `setup-wa-bot.sh`, cukup klik ✎ untuk mengubah nilainya):

| Key | Contoh |
|---|---|
| `wabot.enabled` | `'true'` |
| `wabot.allowedNumbers` | `'081234567890, 6289876543210'` (format 08.., 62.., atau +62.. semua diterima; kosong = semua diabaikan) |
| `wabot.actions.enabled` | `'false'` (ubah ke `'true'` untuk ubah SSID/password/reboot) |
| `wabot.alert.numbers` / `wabot.alert.everyMinutes` / `wabot.alert.faultThreshold` | opsional, sama seperti `bot.alert.*` di Telegram |
| `wabot.httpPort` | opsional, port halaman scan QR (default `3010`, perlu restart service) |

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

- Hanya nomor terdaftar (`wabot.allowedNumbers`) yang dilayani. Nomor lain **diabaikan tanpa balasan** (hanya dicatat di log), supaya kontak/pelanggan yang chat ke nomor itu tidak menerima balasan otomatis.
- Nomor di `wabot.allowedNumbers` harus nomor **lain** dari nomor bot — pesan yang dikirim dari nomor bot sendiri diabaikan.
- Aksi selalu lewat konfirmasi teks dan dicatat di `~/genieacs-bot/audit.log` (log gabungan dengan bot Telegram, ditandai `WA `).
- `wa_auth/` berisi kunci sesi WhatsApp — perlakukan seperti password, jangan commit ke git (sudah ada di `.gitignore`).
- Kalau perangkat bot dicabut dari HP (logout), bot menghapus sesi lama lalu menunggu. Buka halaman scan, klik **Minta QR baru**, dan scan ulang.
- Koneksi yang sudah login tetap disambung ulang otomatis kalau putus karena jaringan; yang manual hanya pembuatan QR.

## Scan QR dari sidebar Admin (tanpa port 3010)

Kalau admin hanya bisa menjangkau port GenieACS UI (mis. lewat VPN yang hanya meneruskan 3000), halaman scan di port 3010 tidak bisa dibuka. Alternatifnya:

```bash
bash scripts/ui-admin-menu.sh --wapage     # atau --all
```

Menu **📱 Bot WA** muncul di sidebar Admin (`/wa.html`). Bot menulis status dan gambar QR ke Config (`wabot.status`, `wabot.qrsvg`; nilainya base64 dalam kutip tunggal) hanya saat isinya berubah, dan mengosongkan QR begitu tersambung. Tombol "Minta QR baru" menulis `wabot.requestQr`. Halaman ini memakai API GenieACS, jadi butuh login admin GenieACS. Perlu diingat QR (rahasia pairing) terbaca oleh admin yang bisa membuka Admin → Config selama QR aktif.
