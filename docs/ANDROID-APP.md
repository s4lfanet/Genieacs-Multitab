# Aplikasi Android "Genieacs.apk" dan cara memakainya dengan Multitab

`Genieacs.apk` adalah klien Android untuk GenieACS (paket `com.genieacs.client`, v1.0.0, ditandatangani **Alijaya Digital** — bukan buatan repo ini). Hasil bedah di bawah berasal dari **analisis statis** (isi manifest, string, dan nama kelas di dalam APK). Aplikasinya **belum dijalankan** (tidak ada perangkat/emulator Android), jadi perilaku yang ditulis "kemungkinan" belum terbukti.

## Isi aplikasi

| Fitur | Cara kerjanya (terlihat di APK) |
|---|---|
| Login | Isian alamat server, username, password. Disimpan di SharedPreferences (`KEY_SERVER_URL`, `KEY_USERNAME`, `KEY_PASSWORD`). Tombol uji koneksi memanggil `/devices?limit=1`. Teks bantuan menyebut **port NBI 7557**. |
| Daftar ONT | `GET /devices?projection=…` dan `/devices?query=…`: pencarian username/SN, filter online/offline (`_lastInform`). |
| Detail ONT | Redaman/RX, IP PPPoE, MAC, SSID dan sandi WiFi (SSID 1, 2, 5), daftar perangkat terhubung. |
| Aksi | Refresh parameter, restart modem, ubah nama WiFi, ubah sandi WiFi: semuanya `POST /devices/<id>/tasks?connection_request` (task `reboot`, `refreshObject`, `setParameterValues`) dengan dialog konfirmasi. |
| Asisten suara | "GenieVoice": pengenalan suara dan suara balasan bawaan Android (perintah: cek redaman, cek sandi, ganti sandi, restart). **Tidak** memanggil layanan AI luar yang terlihat di APK. |

Izin Android: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO` (hanya untuk perintah suara), `DUMP` (bawaan pustaka). Lalu lintas **HTTP polos diizinkan** (`usesCleartextTraffic`), alamat contoh di dalamnya `http://192.168.8.x:7557`.

Parameter yang dibaca dari GenieACS: `VirtualParameters.pppoeUsername`, `pppoeIP`, `RXPower`, `redaman`, `PonMac`, `MacAddress`, `TXPower`, `WlanSSID`, `WlanPassword`, serta `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{1,2,5}.SSID` dan `…KeyPassphrase` / `…PreSharedKey.1.KeyPassphrase` (jalur TR-098).

## Cocok dengan Multitab?

| Kebutuhan aplikasi | Multitab | Catatan |
|---|---|---|
| `pppoeUsername`, `pppoeIP`, `RXPower`, `redaman`, `PonMac`, `WlanPassword` | ✅ ada | |
| `MacAddress`, `WlanSSID` | ✅ **ditambahkan di repo ini** | Skrip diambil dari set VP Alijaya. Belum terpasang di server yang sudah berjalan; lihat "Memasang VP baru" |
| `TXPower` | ❌ tidak ada | Tidak ada juga di set VP Alijaya; kolom TX di aplikasi kemungkinan kosong |
| Endpoint NBI `/devices`, `/tasks` | ✅ | Diuji di produksi: `GET /devices?limit=1` → 200 |
| Perangkat TR-181 (`Device.*`) | ❌ | Aplikasi memakai jalur `InternetGatewayDevice.*` saja |

## Cara menghubungkan

Aplikasi berbicara **langsung ke NBI (port 7557)**, bukan ke port UI 3000.

1. Ponsel harus bisa menjangkau `IP-server:7557` (jaringan yang sama, VPN, atau lewat reverse proxy di bawah).
2. Di aplikasi isi: Server `http://IP-SERVER:7557`, username dan password apa saja (lihat peringatan), lalu **Uji koneksi**.

Uji cepat dari ponsel/PC: `curl "http://IP-SERVER:7557/devices?limit=1"` harus mengembalikan JSON.

## ⚠️ Peringatan keamanan: NBI tidak punya autentikasi

NBI GenieACS **tidak memeriksa username/password**. Di server produksi diuji: `curl -u salah:salah http://127.0.0.1:7557/devices?limit=1` tetap **200**, dan port 7557 mendengarkan di `*:7557` (semua antarmuka). Artinya **siapa pun yang bisa menjangkau port 7557 dapat membaca sandi WiFi semua pelanggan, me-restart, atau mengubah konfigurasi ONT**. Username/password di aplikasi hanya dikirim sebagai header dan diabaikan.

Jangan meneruskan (port-forward) 7557 ke internet. Pilihan yang aman:

**A. Jaringan tertutup (paling sederhana).** Izinkan 7557 hanya dari jaringan/VPN ponsel Anda dengan firewall, mis. `sudo ufw allow from 192.168.54.0/24 to any port 7557 proto tcp` dan `sudo ufw deny 7557/tcp`.

**B. Reverse proxy dengan password.** Biarkan NBI hanya di localhost dan buka satu port berpassword, mis. nginx:

```
# /etc/genieacs ... genieacs.env: GENIEACS_NBI_INTERFACE=127.0.0.1   (lalu restart genieacs-nbi)
server {
    listen 7558;
    location / {
        auth_basic "GenieACS";
        auth_basic_user_file /etc/nginx/genieacs.htpasswd;   # htpasswd -c /etc/nginx/genieacs.htpasswd namaanda
        proxy_pass http://127.0.0.1:7557;
    }
}
```

Di aplikasi pakai `http://IP-SERVER:7558` dan username/password dari htpasswd itu. Aplikasi kemungkinan mengirim header `Authorization: Basic` (terlihat di APK, belum diuji). Pasang TLS (`listen 7558 ssl;`) kalau lewat jaringan yang tidak Anda kuasai, karena aplikasi mengizinkan HTTP polos.

Bot Telegram/WhatsApp, installer, dan halaman Admin memakai `127.0.0.1:7557`, jadi membatasi NBI ke localhost aman bagi mereka.

## Memasang VP baru (`WlanSSID`, `MacAddress`)

Installer memasang VP yang belum ada tanpa menimpa yang sudah ada, jadi jalankan ulang `bash scripts/install.sh` (lihat [INSTALL.md](INSTALL.md)). VP hanya terisi nilainya bila provision `default` men-declare-nya; untuk menampilkannya di aplikasi tambahkan di provision `default` (opsional, ubah manual karena `default` tidak ditimpa):

```
declare("VirtualParameters.WlanSSID", {path: daily, value: daily});
declare("VirtualParameters.MacAddress", {path: daily, value: daily});
```

Tambah declare ini pada ratusan ONT menambah sedikit beban pada inform pertama, jadi coba di sebagian dulu dan pantau fault `too_many_commits`.
