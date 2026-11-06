# Gerbang NBI untuk aplikasi Android (Genieacs.apk Alijaya)

Mengatasi tiga keluhan pada APK Alijaya versi terbaru: **data lambat tampil**, **aplikasi keluar sendiri** (terutama saat ganti tema atau tes koneksi), dan **ditolak firewall karena IP seluler berganti**. APK **tidak diubah** (tanda tangan Alijaya tetap utuh); yang diperbaiki adalah jawaban server.

## Penyebabnya (terukur)

APK terbaru menambah fitur nama pelanggan dan dukungan TR-181, sehingga **daftar ONT meminta seluruh cabang `VirtualParameters`, `WANConnectionDevice`, dan `WLANConfiguration` untuk semua ONT sekaligus**, dan memintanya dua kali saat connect:

| | ukuran |
|---|---|
| APK lama (daftar ringkas) | 0,5 MB |
| APK terbaru, 635 ONT | **41 MB** per permintaan (95% adalah `InternetGatewayDevice`, sebagian besar metadata) |

Mengurai JSON sebesar itu membuat heap aplikasi (batas 192 MB di emulator) habis: log menunjukkan `OutOfMemoryError`, lalu aplikasi mati. Ganti tema dan tes koneksi membuat layar dibuat ulang dan daftar dimuat ulang, jadi crash paling sering muncul di sana.

## Yang dilakukan gerbang

Layanan kecil `genieacs-nbi-slim` (`scripts/nbi-slim.js`, port **7560**) di depan NBI:

1. **Membuang metadata** `_timestamp`, `_writable`, `_object`, `_type`. Aplikasi tidak pernah membacanya (string itu tidak ada di kodenya; yang dibaca `_value`, `_instance`, `_id`, `_lastInform`, `_deviceId`, `_tags`). 41 MB menjadi ±13 MB.
2. **gzip** (aplikasi sudah mengirim `Accept-Encoding: gzip`): ±13 MB menjadi **±0,35 MB** di jaringan.
3. **Cache 15 detik** dan penggabungan permintaan identik: dua kali muat saat connect, ganti tema, dan tes koneksi tidak membebani server.
4. **Login akun UI GenieACS** wajib (HTTP Basic, divalidasi ke UI `:3000`, hasil benar di-cache 10 menit); 10 gagal dari satu IP dalam 10 menit dibatasi (429). Karena itu gerbang boleh dibuka ke internet tanpa daftar IP.
5. **`/users` diblokir** (hash sandi UI tidak lagi bocor) dan hanya jalur yang dipakai aplikasi yang diteruskan: `GET /devices|/faults`, `POST /devices/<id>/tasks` untuk `reboot`, `refreshObject`, `getParameterValues`, `setParameterValues`, `addObject`, `deleteObject`, serta tag. `factoryReset`, `download`, hapus device, preset/provision/file diblokir.

Hasil uji (635 ONT skala nyata, APK asli di emulator): login dan data tampil dalam beberapa detik, 635 ONT, 544 online / 91 offline benar, **ganti tema 6x dan Summon tanpa crash**, password salah menampilkan "Akses Ditolak (401)". Tanpa gerbang pada data yang sama aplikasi mati dengan `OutOfMemoryError`. Uji otomatis: `node tools/test-nbi-slim.js` (43 pemeriksaan).

## Pasang

```
bash scripts/setup-nbi-slim.sh        # di server, butuh sudo; port 7560
```

Lalu:
1. Di **router**, teruskan port publik (mis. `798`) ke `192.168.54.254:7560` (sebelumnya ke `:7557`).
2. Di **aplikasi**, isi server dengan alamat publik dan port itu (mis. `http://103.191.165.119:798`); username/password = akun **UI GenieACS**.
3. Port `3000` juga tetap harus diteruskan: aplikasi memaksa `:3000` pada host yang sama untuk langkah login.

NBI asli di `:7557` dan firewall-nya tidak disentuh; bot, installer, dan halaman Admin tetap memakainya lewat localhost. Setelah port 7560 dipakai, port 7557 tidak perlu lagi diteruskan ke internet, jadi IP seluler yang berganti tidak lagi jadi masalah.

Copot: `bash scripts/setup-nbi-slim.sh --remove`. Konfigurasi: `/etc/genieacs-multitab/nbi-slim.json` (`port`, `listen`, `upstream`, `ui`).

## Batasan

- Akun UI mana pun yang valid bisa memakai gerbang (aplikasi memang login dengan akun UI). Aksi dibatasi seperti di atas, tetapi `setParameterValues` dan `addObject` tetap bisa mengubah konfigurasi ONT; gunakan sandi UI yang kuat.
- Jawaban yang diubah hanya `GET /devices`. Kalau Alijaya memakai metadata `_type`/`_writable` di versi aplikasi berikutnya, gerbang perlu disesuaikan (periksa dengan `docs/ANDROID-APP.md`).
- Ini perbaikan dari sisi server. Penyebab sebenarnya ada di aplikasi (memuat semua ONT sekaligus); sebaiknya dilaporkan ke Alijaya.
