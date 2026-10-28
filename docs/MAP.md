# Peta Pelanggan & ODP (opsional)

Halaman peta (Leaflet) untuk menandai lokasi ONT dan ODP, dibuka dari sidebar **Admin → 🗺 Peta** dan **📡 ODP**. Tidak ada service, port, atau password tambahan: halaman ini ikut GenieACS di port yang sama (mis. 3000), memakai login GenieACS Anda.

## Cara kerja

- `map/peta.html` disalin ke folder `public/` GenieACS (disajikan sebagai `/peta.html`, sama seperti logo). Menu sidebar membukanya di dalam halaman Admin.
- **Daftar ONT**: `GET /api/devices` (API GenieACS sendiri, hanya baca): PPPoE user, SN, model, last inform, `RXPower` (teks "-14 dBm (Bagus)" dibaca angkanya).
- **Lokasi & ODP**: disimpan di satu key **Admin → Config** bernama `peta.data` (JSON dikodekan base64 dalam kutip tunggal, supaya tetap ekspresi Config yang valid). Ikut backup Config. Setiap simpan membaca data terbaru lalu menulis ulang (dua admin menyimpan bersamaan di detik yang sama: yang terakhir menang).
- Penanda ONT: hijau = online & redaman baik, kuning = redaman < -27 dBm, merah = offline, abu = redaman belum ada. Kotak biru = ODP; garis putus-putus = ONT ke ODP-nya.
- Tidak ada perintah ke ONT sama sekali.

## Keamanan

- Halaman statisnya tidak berisi data. Semua data lewat `/api/*` GenieACS, yang menolak (401/403) tanpa login, dan menyimpan data peta butuh izin menulis Config (admin). Menu hanya tampil untuk user yang boleh mengubah Config.
- Browser memuat Leaflet dari unpkg (dikunci SRI) dan tile dari OpenStreetMap/Esri, jadi perlu internet di sisi browser.

## Pasang

```bash
bash scripts/ui-admin-menu.sh --map     # menu Peta + ODP (menambah --bot untuk menu Bot WA juga)
```

Lalu Ctrl+F5 di browser. Skrip ini mengubah **1 file** tampilan GenieACS (`public/app-*.js`; program cwmp/nbi/fs/ui tidak diubah), menyalin `peta.html` ke `public/`, menyimpan salinan asli di `~/genieacs-uipatch/orig/`, dan otomatis mengembalikan kalau UI tidak sehat. Update GenieACS menghapus patch; jalankan lagi. Hanya GenieACS 1.2.13 (titik sisip dicek, versi lain ditolak). Menghapus: `bash scripts/ui-admin-menu.sh --remove` (data `peta.data` tetap ada di Config).

## Pakai

1. **📡 ODP** → "+ ODP baru" → isi ID, nama, kapasitas → "Tandai di peta" → klik lokasi.
2. **🗺 Peta** → pilih pelanggan (yang belum dipetakan tampil di atas) → isi nama/ODP → "Tandai di peta".
