# Aplikasi Android "Genieacs.apk" (Alijaya) dan cara memakainya dengan Multitab

`Genieacs.apk` adalah klien Android untuk GenieACS (paket `com.genieacs.client`, ditandatangani **Alijaya Digital**, bukan buatan repo ini). Isi dokumen ini berasal dari **analisis statis** APK versi terbaru (`Genieacs (2).apk`: manifest, string, kode smali, satu berkas HTML di dalamnya), pembacaan repo [alijayanet/genieacs-multitab-mod](https://github.com/alijayanet/genieacs-multitab-mod), dan **uji jalan di emulator Android** terhadap server tiruan (login, daftar ONT, detail ONT, Summon, Peta). Bagian server yang ditulis di sini (VP, deklarasi `default`, sinkron tag Peta) diuji di sisi Multitab.

Aplikasi pihak ketiga ini hanya bisa dipakai di **jaringan lokal / VPN** (alasannya ada di "Cara menghubungkan"). Untuk akses dari internet dan fitur ZTE (bridge, port LAN), yang cocok adalah klien native buatan sendiri (SALFA ACS, folder `android/`) yang bicara ke proxy NBI berpassword.

## Isi aplikasi (versi terbaru)

| Fitur | Cara kerjanya (terlihat di APK) |
|---|---|
| Login | 3 langkah ke server: (1) `GET <NBI>/devices?limit=1` dengan header Basic; (2) `GET <NBI>/users`; bila terbaca, sandi diverifikasi **di ponsel** dengan PBKDF2 memakai `salt` dan hash dari server (bila ditolak/gagal, langkah ini dilewati); (3) `POST http://<host>:3000/login` ke UI GenieACS, yang selalu dijalankan. Jadi pengguna/sandi harus akun **UI GenieACS yang sungguhan**. |
| Daftar & detail ONT | `GET /devices`: pencarian, filter online/offline, redaman, IP PPPoE, MAC, SSID dan sandi WiFi, perangkat terhubung. |
| Aksi ONT | `POST /devices/<id>/tasks?connection_request`: restart (`reboot`), **Summon = `refreshObject` pada seluruh `InternetGatewayDevice`**, ubah SSID/sandi/keamanan/aktif WiFi (`setParameterValues`). |
| Tambah/ubah WAN | `addObject` + `setParameterValues`, **hanya parameter vendor Huawei (`X_HW_*`), CT-COM, dan CMCC**. Tidak ada parameter ZTE (`X_ZTE-COM_*`, `X_ZTE-COM_PortBinding`). |
| Ubah massal akun admin | Mengubah akun web ONT banyak modem sekaligus (ZTE `X_ZTE-COM_WebUserInfo.AdminName/AdminPassword`, Huawei `X_HW_WebUserInfo.2`, FiberHome `X_FH_WebUserInfo.WebSuper*`, CMCC/CT `TeleComAccount`). |
| Peta jaringan | Halaman `assets/map/peta.html` (Leaflet, ubin OpenStreetMap dan satelit Google): pelanggan, ODP, kabel ke ODP, GPS ponsel, rute ke Google Maps, Summon dari peta. Lokasi disimpan sebagai **tag di device** (lihat "Peta: tag aplikasi"). |
| Asisten | "GenieVoice": pengenalan suara dan suara balasan bawaan Android, dan tanya-jawab dengan Google Gemini memakai **kunci API yang Anda isi sendiri di aplikasi**. **Aplikasi membawa kunci Gemini bawaan milik pembuatnya** (`DEFAULT_GEMINI_API_KEY` di `AppPreferences`; kolom "Gemini AI Key" di layar login sudah terisi sejak instal pertama). Kunci itu bukan milik Anda dan dipakai bersama oleh semua pengguna aplikasi; ganti dengan kunci Anda sendiri atau kosongkan bila asisten suara tidak dipakai. Selain itu tidak ditemukan rahasia lain (898 berkas dipindai).

Izin Android: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE/COARSE_LOCATION` (GPS peta), `RECORD_AUDIO` (suara). Lalu lintas **HTTP polos diizinkan**.

Yang dibaca aplikasi dari server: Virtual Parameter `pppoeUsername`, `pppoeIP`, `RXPower`, `TXPower`, `redaman`, `PonMac`, `MacAddress`, `WlanSSID`, `WlanPassword`, `superAdmin`, `superPassword`; jalur `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{1..5}`, `…LANEthernetInterfaceConfig.{1..4}`, `…WANConnectionDevice.*`, `…UserInterface.*`; dan tag `LOC_*`/`ODP_*`.

## Kecocokan dengan Multitab

| Kebutuhan aplikasi | Status | Catatan |
|---|---|---|
| `pppoeUsername`, `pppoeIP`, `RXPower`, `redaman`, `PonMac`, `WlanPassword`, `superAdmin`, `superPassword` | ✅ sudah ada | |
| `WlanSSID`, `MacAddress` | ✅ VP ada di repo; server lama perlu `scripts/app-compat.sh` | skrip diambil dari set VP Alijaya; diuji pada data 19 model produksi |
| `TXPower` | ✅ **VP baru ditulis di repo ini** (tidak ada di set Alijaya) | ZTE, Huawei, C-Data, ZICG/CT-COM, ZTE EPON; diuji pada data nyata (F679D 2,66 dBm, F670L 2,12 dBm) |
| Nilai ketiga VP itu **terisi** | ⚠️ hanya bila provision `default` men-declare-nya | Summon aplikasi tidak mengisi VP. Server baru dari installer sudah benar; server lama: `bash scripts/app-compat.sh` |
| Lokasi peta (tag `LOC_`/`ODP_`) | ✅ halaman **Peta** Multitab membaca dan menulis tag yang sama | lihat "Peta: tag aplikasi" |
| NBI `/devices`, `/tasks` | ✅ | |
| Tambah WAN pada **ZTE** | ❌ aplikasi tidak punya parameter ZTE | pakai halaman **Bridge** Multitab (atau klien SALFA ACS) |
| Perangkat TR-181 (`Device.*`) | ❌ | aplikasi hanya memakai `InternetGatewayDevice.*` |

## Hasil uji jalan di emulator

Diuji di emulator Android (API 36) terhadap server tiruan yang meniru NBI 7557 dan login UI 3000 dengan data ONT ZTE nyata:
- Login mengikuti persis alur di atas: `GET /devices?limit=1` (tanpa lalu dengan Basic), `GET /users` (server tiruan membalas daftar kosong; login tetap lolos), lalu `POST :3000/login` (form `username=…&password=…`).
- Daftar ONT memakai satu `GET /devices?projection=…` yang meminta VP `pppoeUsername`, `RXPower`, `redaman`, `WlanSSID`; tag `ODP_*` tampil sebagai filter dan label.
- Detail ONT menampilkan Rx dan **Tx** (VP `TXPower` "2.66 dBm" tampil "2.7 dBm"), IP PPPoE, MAC, tag, dan koordinat dari tag `LOC_`; **Summon** mengirim `refreshObject` dengan `objectName` kosong; **Peta** memuat "Terpetakan: 1" dari tag tersebut.
- Belum diuji: ubah WiFi/WAN/akun admin terhadap ONT sungguhan, asisten suara, dan GPS.

## Cara menghubungkan

1. Ponsel harus menjangkau **dua port di host yang sama**: NBI `IP:7557` (data) **dan** UI `IP:3000` (login). Aplikasi mengambil host dari alamat server yang Anda isi dan **memaksa port 3000** untuk login, sehingga tidak bisa dipakai lewat Cloudflare Tunnel atau reverse proxy satu port.
2. Di aplikasi: Server `http://IP-SERVER:7557`, username dan password = **akun UI GenieACS** (mis. `admin`).
3. Dari luar kantor, pakai **VPN** (mis. WireGuard) ke LAN server, bukan membuka port.

Uji dari ponsel/PC: `curl "http://IP-SERVER:7557/devices?limit=1"` harus mengembalikan JSON, dan `http://IP-SERVER:3000/` harus membuka halaman login GenieACS.

## ⚠️ Keamanan: NBI tidak punya autentikasi dan membocorkan hash akun UI

NBI GenieACS **tidak memeriksa username/password**. Diuji di server produksi:
- `curl -u salah:salah http://127.0.0.1:7557/devices?limit=1` → **200**; port 7557 mendengarkan di `*:7557` (semua antarmuka).
- **`GET http://127.0.0.1:7557/users` → 200 tanpa login**, berisi `_id`, `roles`, `salt`, dan **hash PBKDF2 sandi akun UI**. Itulah yang dipakai aplikasi untuk memverifikasi sandi, dan itu berarti **siapa pun yang bisa menjangkau port 7557 dapat mengambil hash sandi admin untuk dicrack offline**, selain membaca sandi WiFi semua pelanggan dan me-restart/ mengubah ONT.

Karena itu: jangan membuka 7557 ke internet, batasi ke jaringan tepercaya, dan pakai sandi UI yang panjang dan unik.

**A. Batasi lewat firewall** dengan `bash scripts/nbi-firewall.sh --apply`. Skrip ini hanya menyentuh port 7557 (tidak mengaktifkan `ufw`, tidak mengubah kebijakan bawaan, tidak menyentuh 3000/7547/7567): mengizinkan localhost, subnet jaringan server sendiri, tambahan `--allow CIDR` (mis. VPN), dan sambungan yang sudah berjalan; selain itu dicatat (`journalctl -k | grep gm-nbi-blok`) lalu ditolak. Tanpa argumen skrip hanya menampilkan status; `--remove` mencabut semuanya. Dipasang sebagai service systemd supaya aturan kembali setelah reboot, dan dicabut otomatis bila uji sesudah pemasangan gagal. Bot Telegram/WhatsApp, installer, dan halaman Admin memakai `127.0.0.1:7557`, jadi tidak terpengaruh. **Perhatian:** perangkat di subnet lain yang selama ini memakai 7557 (mis. aplikasi Alijaya dari VLAN lain) akan ditolak sampai ditambahkan dengan `--allow`.

**B. Akses dari internet** (untuk klien native buatan sendiri) lewat proxy berpassword ([CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md)). Proxy itu sengaja **memblokir `/users`** dan hanya meneruskan daftar putih; karena itu aplikasi Alijaya tidak bekerja lewat proxy (selain itu langkah login memaksa port 3000).

## Menerapkan kompatibilitas di server yang sudah berjalan

```
bash scripts/app-compat.sh            # PERIKSA SAJA: tampilkan apa yang akan berubah (tidak menulis)
bash scripts/app-compat.sh --apply    # backup dulu, lalu terapkan; rollback otomatis bila UI tidak sehat
```

`--apply` menambahkan VP `WlanSSID`, `MacAddress`, `TXPower` bila belum ada (tidak menimpa yang berbeda) dan tiga baris `declare` ke provision `default` yang **sudah ada** (hanya bila belum ada, di titik sisip yang dikenal; bila tidak ditemukan, skrip mencetak baris yang perlu ditambahkan manual). Tidak menyentuh preset, ONT, atau VP/provision lain. Mengembalikan: `bash scripts/restore.sh <folder backup yang dicetak>`. Nilai terisi bertahap saat tiap ONT inform (TXPower tiap jam, WlanSSID dan MacAddress tiap hari). Uji skrip (pada salinan database): 21 pemeriksaan lolos, termasuk idempoten, tidak menimpa VP berbeda, dan restore.

## Peta: tag aplikasi ↔ halaman Peta Multitab

Aplikasi menyimpan lokasi sebagai tag device; Multitab menyimpan di Config `peta.data`. Halaman **Admin → Peta** kini membaca dan menulis kedua-duanya:

| Tag (ditulis aplikasi) | Arti |
|---|---|
| `LOC_<lat×1.000.000>_<lng×1.000.000>` | lokasi pelanggan, mis. `LOC_-6330000_108320000` (juga dikenali: `LOC:lat,lng`) |
| `ODP_<nama>_<lat×1e6>_<lng×1e6>` atau `ODP_<nama>` | ODP yang terhubung; nama dibersihkan aplikasi (spasi → `-`, karakter selain huruf/angka/`-`/`_` dibuang) |

- **Membaca:** ONT yang belum ada di `peta.data` tetapi punya tag `LOC_` muncul di peta (ditandai "Dari aplikasi"); ODP dari tag ikut tampil. `peta.data` tetap menjadi sumber utama.
- **Impor:** tombol "Impor dari aplikasi Android" menyalin titik dan ODP dari tag ke `peta.data` (tag tidak diubah).
- **Menulis:** kotak "Sinkronkan ke tag device" (bawaan aktif, diingat di browser). Saat Anda menyimpan/memindah/menghapus lokasi ONT, atau mengubah/menghapus ODP, tag `LOC_`/`ODP_` di ONT yang terkait ikut diperbarui sehingga aplikasi melihat data yang sama. Tag lain (mis. `VIP`) tidak pernah disentuh. Menulis tag memerlukan izin ubah device pada akun UI yang dipakai.
- Diuji di Chrome dengan API tiruan yang meniru bentuk UI API asli (kunci `Tags.<nama>`, penulisan lewat `POST /api/devices/<id>/tags`): 34 uji format tag dan 7 skenario (muat, impor, simpan, pindah, ganti nama ODP, hapus, sinkron dimatikan). **Belum diuji dengan login UI asli di produksi.**

## Catatan penting saat memakai aplikasi ini bersama Multitab

- **Preset `useradmin`** (bila aktif) memaksa kembali akun web ONT setiap inform. Perubahan akun lewat "Ubah massal akun admin" aplikasi akan **tertimpa** saat inform berikutnya.
- **Summon** aplikasi me-refresh seluruh pohon `InternetGatewayDevice` (berat dan lama di ONT yang lambat); itu perilaku aplikasi, bukan Multitab.
- **ZTE:** tambah WAN dari aplikasi tidak dikenali ONT ZTE (tanpa parameter ZTE). Untuk bridge dan ikat port LAN pada ZTE F679D/F670L pakai halaman **Bridge** di sidebar Admin ([BRIDGE-ZTE.md](BRIDGE-ZTE.md)).

## Yang ada di repo Alijaya tetapi tidak digabung

| Komponen repo Alijaya | Keputusan |
|---|---|
| `public/peta.html` + `agent.py` (`/api/geo/*`, koleksi MongoDB `device_locations`) | tidak digabung: butuh layanan Python `agent.py`; Multitab sudah punya Peta sendiri (`peta.data`) dan kini kompatibel dengan tag aplikasi |
| `agent.py` (AI, suara, kontrol WiFi/WAN, asisten) dan `public/voice.html` | tidak digabung: layanan Python 263 KB tersendiri. Multitab sudah punya bot Telegram/WhatsApp dengan asisten AI (`bot/core.js`); aplikasi Android punya asisten suaranya sendiri |
| `public/mywifi.html` (portal pelanggan ubah WiFi lewat OTP WhatsApp) | tidak digabung: bergantung pada `agent.py` dan nomor WhatsApp; bisa jadi pekerjaan tersendiri |
| `whatsapp/*` (bot WhatsApp) | tidak digabung: Multitab punya `bot/wa.js` |
| VP `WlanSSID`, `MacAddress` | **digabung** (dan `TXPower` ditulis baru) |
| `public/app.js`, `app.css`, `genieacs_ui_mod.tar.gz` (UI GenieACS yang dimodifikasi) | tidak digabung: Multitab memakai tampilan sendiri lewat Config `ui.*` dan patch bundle |
