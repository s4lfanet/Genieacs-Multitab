# Branding: Logo, Judul & Warna Header

GenieACS 1.2 menulis logo (`logo-*.svg`) dan teks versi langsung di file program UI, tidak lewat Config. Script `branding/branding.js` menjembatani hal ini:

- **Logo** diambil dari **Admin → Files** (disajikan oleh genieacs-fs di port 7567), lalu dibungkus jadi SVG dan ditulis ke `public/logo-*.svg`.
- **Judul, subtitle, dan warna** diambil dari **Admin → Config** `branding.*`, lalu ditambahkan sebagai blok CSS di akhir `public/app-*.css`, di antara penanda `/*BRANDING-START*/ ... /*BRANDING-END*/`.
- Salinan asli kedua file disimpan di `~/genieacs-branding/orig/`.
- Dijalankan cron tiap menit. File hanya ditulis kalau ada perubahan.

## Pasang

```bash
bash scripts/setup-branding.sh
```
Script ini butuh **sudo sekali** untuk memberi user Anda izin tulis ke 2 file tadi saja (`chown`). File GenieACS lain tidak disentuh.

## Pakai

### Ganti logo
1. **Admin → Files → New**
   - Type: `2 Web Content`
   - OUI / Product Class / Version: kosongkan
   - File: logo Anda (PNG/JPG/SVG/GIF/WEBP, maks 2MB). **Beri nama `logo.png`**, atau samakan `branding.logo` dengan nama file.
2. Tunggu ±1 menit, lalu tekan **Ctrl+F5**.

Logo ditampilkan setinggi 56 px (lebar maks 260 px). Potong ruang kosong di sekitar gambar supaya terlihat besar.

File di menu Files hanya dikirim ke ONT kalau ada task download yang memakainya, jadi logo ini aman.

### Key Config

| Key | Contoh | Fungsi |
|---|---|---|
| `branding.title` | `'NAMA ISP'` | Judul besar di sebelah logo (kosong = tidak tampil) |
| `branding.subtitle` | `'NOC Monitoring'` | Pengganti teks `v1.2.13+...` (kosong = versi asli) |
| `branding.headerColor` | `'#f2eddf'` | Warna latar header |
| `branding.textColor` | `'#2d3748'` | Warna judul & subtitle |
| `branding.logo` | `'logo.png'` | Nama file logo di Admin → Files |

Nilai teks pakai kutip tunggal. Karakter `" \ < > { } ;` dibuang otomatis, dan panjang maksimal 40 karakter.

## Cek & batal

```bash
tail ~/genieacs-branding/log.txt                 # riwayat sinkron & error
node ~/genieacs-branding/branding.js restore     # kembali ke logo & CSS asli
crontab -e                                       # hapus baris genieacs-branding (opsional)
```

Setelah GenieACS di-update atau di-reinstall, kedua file kembali ke aslinya. Jalankan `setup-branding.sh` lagi untuk mengembalikan izin tulis, dan cron akan memasang ulang branding.

Batasan: judul tab browser tetap "… - GenieACS".
