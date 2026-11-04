# Portal Mandiri WiFi pelanggan

Halaman web untuk **pelanggan**: masuk dengan nomor HP + kode OTP WhatsApp, lalu mengganti nama WiFi, mengganti sandi WiFi, me-restart modem, dan melihat status/redaman, **hanya untuk ONT miliknya**. Terinspirasi portal `mywifi` di Multitab Alijaya, tetapi ditulis ulang dengan model keamanan yang lebih ketat (tanpa mode "tanpa OTP").

Jalannya: layanan terpisah `genieacs-portal` (`bot/portal.js`, port 3020) → NBI `127.0.0.1:7557` (hanya lokal) untuk membaca/mengubah ONT; OTP dikirim lewat **bot WhatsApp** yang sudah ada.

## Syarat

1. **Bot WA terpasang dan tersambung** ([WHATSAPP-BOT.md](WHATSAPP-BOT.md)). Portal hanya menitipkan OTP ke antrean; bot WA yang mengirim. Baca risiko Baileys (protokol tidak resmi, nomor bisa diblokir) dan pakai nomor khusus.
2. **Nomor pelanggan ada di tag ONT** (Admin → Devices → tag, atau tag di aplikasi): `wa:081234567890`, `081234567890`, atau `+62 812-3456-7890`. Tag lain (`LOC_...`, `ODP_...`, `VIP`) diabaikan.
   - Satu nomor harus cocok dengan **tepat satu** ONT. Nomor yang cocok ke beberapa ONT **ditolak** (tidak dikirimi OTP) dan dicatat di audit log.

## Pasang

```
bash scripts/setup-portal.sh           # pasang service; portal NONAKTIF dan tidak membuka firewall
bash scripts/ui-admin-menu.sh --all --portal   # menu Admin -> Portal WiFi (pengaturan); updater memasangnya otomatis bila portal terpasang
```

Lalu di **Admin → Portal WiFi**: isi nama, nomor CS, centang **Portal aktif**, Simpan (berlaku ±20 detik). Uji lokal: `curl http://127.0.0.1:3020/` harus 200.

Copot: `bash scripts/setup-portal.sh --remove` (file dan key `portal.*` dibiarkan).

## Akses dari internet

Jangan membuka NBI (7557). Buka **hanya** port portal (3020), idealnya lewat HTTPS:

- **Cloudflare Tunnel** ([CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md)): tambahkan hostname, mis. `wifi.domain.com` → `http://localhost:3020`. Lalu aktifkan **"Di belakang proxy/tunnel"** (`portal.trustProxy`) agar batas laju memakai IP asli pelanggan dari `CF-Connecting-IP`. **Jangan** aktifkan opsi itu bila portal terbuka langsung tanpa proxy tepercaya: header bisa dipalsukan dan batas laju per IP bisa dilewati.
- Tanpa tunnel: teruskan port 3020 di router/firewall dan pasang reverse proxy HTTPS di depannya.

## Keamanan (yang diterapkan dan diuji)

| Risiko | Penanganan |
|---|---|
| Login hanya dengan nomor | Tidak ada. OTP **wajib**: 6 digit acak, berlaku 5 menit (atur), disimpan sebagai hash, sekali pakai |
| Tebak OTP | Maks **3 tebakan** per kode (setelah itu kode hangus, kode benar pun ditolak); 20 verifikasi / 10 menit / IP |
| Spam OTP / pemakaian WhatsApp | Jeda 60 detik per nomor, maks 3 OTP / 10 menit / nomor, 10 permintaan / 10 menit / IP |
| Menebak nomor pelanggan | Respons "minta OTP" **sama persis** untuk nomor terdaftar maupun tidak |
| Pelanggan membuka ONT pelanggan lain | ONT diambil dari sesi, **bukan** dari permintaan; `deviceId`/`_id` dari browser diabaikan; nomor SSID divalidasi terhadap daftar ONT itu sendiri |
| Parameter sembarang | Hanya `SSID`, sandi WiFi, dan `reboot`. Tidak ada akses admin web ONT, WAN, atau parameter lain |
| Sandi WiFi bocor | Sandi lama tidak pernah dikirim ke browser; sandi/nilai baru tidak dicatat di audit log; nomor di log disamarkan (4 digit terakhir) |
| Pembajakan sesi | Token acak 256-bit di memori server (restart = semua sesi keluar), masa berlaku 30 menit, hanya dikirim lewat header |
| Penyalahgunaan | Maks 10 perubahan / hari / pelanggan (atur), 12 aksi / menit |
| XSS/clickjacking | CSP ketat, `X-Frame-Options: DENY`, `no-store`; teks dari server tidak dimasukkan lewat `innerHTML` |

Pesan OTP singgah di Config GenieACS (`portal.out.*`) paling lama beberapa detik sampai bot WA mengirim dan menghapusnya; pesan lebih dari 2 menit dibuang.

## Uji

`node tools/test-portal.js` (NBI tiruan, tanpa jaringan/MongoDB): 72 pemeriksaan, mencakup tebak OTP, replay, kedaluwarsa, nomor ganda, sesi lintas-ONT, injeksi `idx`/nilai, batas laju, `X-Forwarded-For` palsu, batas ukuran body, dan audit log. Diuji juga di server dengan database sandbox: antrean OTP lewat MongoDB sungguhan dan layanan `portal.js` (200, respons seragam, 503 saat nonaktif); dan di Chrome (login → OTP → dasbor → ganti nama WiFi).

**Belum diuji:** pengiriman OTP lewat WhatsApp sungguhan dan perubahan WiFi pada ONT sungguhan (uji dulu pada satu ONT milik Anda sendiri sebelum diumumkan ke pelanggan).

## Catatan

- Perubahan nama/sandi memutus perangkat yang terhubung ke SSID itu; halaman meminta konfirmasi.
- Setelah mengganti nama WiFi, daftar di halaman disegarkan sendiri; ONT yang offline menerapkan perubahan saat inform berikutnya.
- Update sistem lewat tombol Update ikut memperbarui `portal.js` bila portal terpasang, lalu memulai ulang `genieacs-portal`.
