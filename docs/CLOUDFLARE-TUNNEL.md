# Akses publik lewat Cloudflare Tunnel

Membuka GenieACS (UI + Multitab) dan API untuk aplikasi Android dari internet **tanpa membuka port di router**. Server hanya membuat koneksi keluar ke Cloudflare. Opsional; tidak ada yang berubah bila tidak dipasang.

> Status uji: logika proxy NBI diuji lokal (38 pemeriksaan, NBI palsu). `scripts/setup-tunnel.sh` dan tunnel Cloudflare **belum pernah dijalankan** di server asli; jalankan lebih dulu di waktu yang tenang dan periksa hasilnya.

## Rancangan: satu tunnel, dua subdomain

Tunnel bekerja per nama host, bukan per port, jadi port UI dan API yang berbeda tidak masalah.

| Subdomain (contoh) | Tujuan di server | Dipakai untuk |
|---|---|---|
| `acs.domainanda.com` | `http://localhost:3000` | UI GenieACS dan halaman Multitab (Peta, Bot, Update, Status, Bridge) |
| `api.domainanda.com` | `http://localhost:7558` | Proxy NBI **berpassword** (aplikasi Android / integrasi) |

Halaman Multitab memanggil `/api/...` ke host yang sama, jadi otomatis ikut lewat `acs.…` tanpa perubahan.

**Jangan pernah** mengarahkan host ke `localhost:7557` (NBI), `7547` (CWMP), atau `7567` (FS):
- NBI **tidak punya autentikasi**. Siapa pun yang mencapainya bisa membaca sandi WiFi semua pelanggan, me-restart, dan mengubah ONT. Karena itu ada proxy di port 7558.
- ONT tetap memakai `http://IP:7547` di jaringan Anda. Mengubah URL ACS di ratusan ONT ke HTTPS itu berisiko dan banyak ONT tidak mendukung TLS modern.

## Pasang

1. **Cloudflare**: domain harus sudah memakai nameserver Cloudflare. Zero Trust → Networks → Tunnels → *Create a tunnel* → *Cloudflared* → salin **token**.
2. **Server** (user biasa yang punya sudo):
   ```
   CF_TUNNEL_TOKEN='eyJ...' bash scripts/setup-tunnel.sh --api-user salfa
   ```
   Skrip memasang `cloudflared`, proxy NBI (`genieacs-nbi-proxy`, jalan sebagai user `nobody`), lalu membuat dua service systemd. Sandi proxy dibuat acak dan **dicetak sekali**; atau tentukan sendiri lewat `NBI_PROXY_PASSWORD` (minimal 12 karakter). Token disimpan di `/etc/cloudflared/token.env` (0600), bukan di berkas unit yang bisa dibaca semua pengguna.
3. **Cloudflare, tab Public Hostname** tunnel itu: tambahkan dua baris di tabel atas (HTTP, bukan HTTPS, karena tunnel terenkripsi sampai Cloudflare).
4. (Disarankan) **Cloudflare Access** untuk `acs.…` (Zero Trust → Access → Applications → Self-hosted, kebijakan email/OTP). Itu lapis kedua di depan login GenieACS, dan UI ini bisa mengubah semua ONT.

Hanya UI tanpa API: tambahkan `--no-api` dan lewati baris `api.…`.

Hapus: `bash scripts/setup-tunnel.sh --remove` (lalu hapus tunnel di dashboard Cloudflare).

## Apa yang diizinkan proxy NBI

Daftar putih; selain ini dijawab 403 dan **tidak** diteruskan ke NBI. Autentikasi memakai HTTP Basic (sandi disimpan sebagai hash scrypt), dan 10 kali gagal dari satu IP mengunci IP itu 10 menit (429).

| Diizinkan | Keterangan |
|---|---|
| `GET /devices…` | baca device (daftar, pencarian, detail) |
| `POST /devices/<id>/tasks` task `reboot`, `refreshObject`, `getParameterValues` | restart, refresh, baca parameter |
| `POST …/tasks` task `setParameterValues` | **hanya** SSID dan sandi WiFi: `…WLANConfiguration.N.SSID`, `…KeyPassphrase`, `…PreSharedKey.N.KeyPassphrase`, `VirtualParameters.WlanSSID/WlanPassword` |

Tidak diteruskan: hapus device, preset/provision/Virtual Parameter, file/firmware, `factoryReset`, `download`, `addObject`/`deleteObject`, mengubah URL ACS atau parameter lain. Jadi kalau kredensial proxy bocor, kerugiannya jauh lebih kecil daripada NBI terbuka.

Catatan: daftar putih disusun dari apa yang terlihat di `Genieacs.apk` (lihat [ANDROID-APP.md](ANDROID-APP.md)); aplikasinya belum dijalankan, jadi bila ada fitur aplikasi yang gagal dengan 403, lihat `journalctl -u genieacs-nbi-proxy` (baris `larang …`) dan kabari agar daftar disesuaikan.

## Aplikasi Android

Di aplikasi (APK asli maupun `SalfaNet-ACS.apk` hasil rakit ulang): server `https://api.domainanda.com`, lalu buka **Autentikasi Tambahan** dan isi pengguna dan sandi proxy. Aplikasi tidak memerlukan port.

## Pemeriksaan

```
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7558/devices?limit=1          # 401 (tanpa login)
curl -s -u salfa:SANDI 'http://127.0.0.1:7558/devices?limit=1' | head -c 200             # JSON
curl -s -o /dev/null -w '%{http_code}\n' https://api.domainanda.com/devices?limit=1      # 401 dari luar
systemctl status cloudflared genieacs-nbi-proxy
```

Admin → **Status** menampilkan `Cloudflare Tunnel` dan `Proxy NBI (tunnel)` di bagian layanan pendukung (bila terpasang).

## Pemecahan masalah

| Gejala | Penyebab / tindakan |
|---|---|
| Cloudflare menampilkan error 502/1033 | `cloudflared` mati atau token salah: `journalctl -u cloudflared -n 30` |
| `api.…` 502 | proxy atau NBI mati: `systemctl status genieacs-nbi-proxy genieacs-nbi` |
| `api.…` 401 terus | pengguna/sandi salah; sandi baru: `printf '%s' 'sandibaru12+' \| node /usr/local/lib/genieacs-multitab/nbi-proxy.js --make-conf salfa \| sudo tee /etc/genieacs-multitab/nbi-proxy.json` lalu `sudo systemctl restart genieacs-nbi-proxy` |
| UI terbuka tetapi halaman Multitab kosong | tekan Ctrl+F5; pastikan Access tidak memblokir `/api/*` untuk browser yang sama |
| Banner "Configuration has been modified" | wajar sesudah Config berubah; tidak berkaitan dengan tunnel |
