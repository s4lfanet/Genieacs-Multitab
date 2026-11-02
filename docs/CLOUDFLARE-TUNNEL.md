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

## Halaman di sidebar Admin

**Admin → Jaringan → Tunnel** (`/tunnel.html`) menampilkan status `cloudflared` dan proxy NBI, serta panduan 5 langkah: isi domain dan subdomain, lalu halaman membuatkan perintah pemasangan, tabel Public Hostname untuk disalin ke Cloudflare, dan pengaturan aplikasi Android. Tombol *Cek jangkauan* memeriksa apakah kedua host menjawab dari browser Anda.

Halaman ini sengaja **tidak memasang apa pun dan tidak menerima token** (token tidak boleh tersimpan di Config yang terbaca banyak pengguna). Pemasangan tetap lewat `scripts/setup-tunnel.sh` di server. Halaman ikut terpasang lewat Admin → Update atau `bash scripts/ui-admin-menu.sh --tunnel`.

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
| Log `cloudflared` penuh `datagram manager error: timeout` | UDP/QUIC diganggu jaringan. Service sudah memakai `--protocol http2` (TCP 7844) agar stabil; bila Anda memasangnya manual, tambahkan opsi itu |
| Cloudflare menampilkan error 502/1033 | `cloudflared` mati atau token salah: `journalctl -u cloudflared -n 30` |
| `api.…` 502 | proxy atau NBI mati: `systemctl status genieacs-nbi-proxy genieacs-nbi` |
| `api.…` 401 terus | pengguna/sandi salah; sandi baru: `printf '%s' 'sandibaru12+' \| node /usr/local/lib/genieacs-multitab/nbi-proxy.js --make-conf salfa \| sudo tee /etc/genieacs-multitab/nbi-proxy.json` lalu `sudo systemctl restart genieacs-nbi-proxy` |
| UI terbuka tetapi halaman Multitab kosong | tekan Ctrl+F5; pastikan Access tidak memblokir `/api/*` untuk browser yang sama |
| Banner "Configuration has been modified" | wajar sesudah Config berubah; tidak berkaitan dengan tunnel |

## Memakai nama (subdomain) sebagai URL ACS di jaringan MikroTik

Tunnel hanya meneruskan HTTP/HTTPS (443). Port **7547 (CWMP) tidak lewat tunnel**: ONT tetap terhubung langsung di LAN. Yang bisa diganti adalah *cara ONT menemukan server*: pakai nama yang di-resolve MikroTik, bukan IP. Pakai **nama terpisah** khusus lokal, bukan nama yang dipakai tunnel:

| Nama | Untuk | Mengarah ke |
|---|---|---|
| `acs.salfa.my.id` | Web UI publik lewat tunnel | Cloudflare |
| `cwmp.salfa.my.id` (contoh) | URL ACS di ONT | `192.168.54.254`, hanya di DNS MikroTik |

Keuntungan: bila IP server berubah, cukup ubah satu entri DNS di MikroTik, bukan ratusan ONT.

**1. MikroTik (siapkan dulu, belum menyentuh ONT)**
```
/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8
/ip dns static add name=cwmp.salfa.my.id address=192.168.54.254 comment="ACS TR-069 lokal"
/ip dns cache flush
# izinkan ONT bertanya DNS ke router (letakkan SEBELUM aturan drop):
/ip firewall filter add chain=input in-interface=TR069_CDATA protocol=udp dst-port=53 action=accept place-before=0
/ip firewall filter add chain=input in-interface=TR069_CDATA protocol=tcp dst-port=53 action=accept place-before=0
# DHCP untuk ONT harus memberi DNS = IP router di subnet itu (contoh 172.21.10.1):
/ip dhcp-server network set [find address~"172.21.8"] dns-server=172.21.10.1
```
Uji dari subnet ONT (atau dari ONT, menu ping/diagnostik): `cwmp.salfa.my.id` harus menjawab `192.168.54.254`.

**2. Satu ONT uji dulu** (jangan massal)
- Pastikan ONT uji masih bisa dibuka web admin-nya dari LAN (jalan kembali bila ia lepas dari ACS).
- Di GenieACS: buka ONT → tab **Admin Web** → bagian ACS / TR-069 → ubah `ManagementServer.URL` menjadi `http://cwmp.salfa.my.id:7547` → commit.
- Tunggu satu siklus inform (±5 menit). ONT harus tetap muncul dengan *Last inform* baru. Kalau tidak, kembalikan URL ke `http://192.168.54.254:7547` lewat web admin ONT.

**3. Sesudah uji berhasil**, ubah ONT lain **bertahap** (puluhan, bukan semua sekaligus), dan pantau fault serta *Last inform*. Jangan memakai preset `inform`/`useradmin` untuk mendorong URL baru ke semua ONT; installer sengaja menonaktifkan pengubahan URL ACS otomatis (`GM_ENABLE_INFORM`).

### Membuka web UI dari dalam LAN
- **Lewat tunnel** (disarankan): pastikan DNS router meneruskan ke DNS publik (`servers=1.1.1.1,8.8.8.8` di atas) dan hapus cache; lalu `https://acs.salfa.my.id` terbuka dengan HTTPS. Ini juga memperbaiki `ERR_NAME_NOT_RESOLVED` bila router menyimpan jawaban "domain tidak ada".
- **Langsung ke server:** `/ip dns static add name=acs.salfa.my.id address=192.168.54.254` lalu buka `http://acs.salfa.my.id:3000`. Server tidak punya HTTPS di 443, jadi `https://acs.salfa.my.id` tanpa port akan gagal di LAN bila nama ini di-override.
