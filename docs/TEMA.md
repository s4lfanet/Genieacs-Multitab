# Tema tampilan

Dipasang oleh `bash scripts/ui-admin-menu.sh --theme` (atau `--all`). Pemilih tema: tombol di pojok kanan bawah atau menu **Tema** di sidebar Admin. Pilihan diingat per browser (`localStorage`, key `acs_theme`).

| Terang | Gelap |
|---|---|
| Terang (bawaan), Laut, Hutan, Senja, Mawar | Gelap, Gelap Laut, Gelap Hutan, Gelap Senja |

## Cara kerja

`scripts/lib/theme-runtime.js` dijalankan di browser (disisipkan ke awal bundle `app-*.js`). Tiap tema adalah satu set token warna yang:

- menimpa variabel CSS bawaan GenieACS `--color1..5` (border, latar kontrol/sidebar, aksen, teks);
- menimpa semua aturan yang memakai warna tetap: header, laci edit parameter, popup, notifikasi, ikon **tag** (gambar beige), CodeMirror (editor script), tab multi-tab dari Config `ui.device`, dan grafik pie;
- memakai `color-scheme: dark` pada tema gelap, sehingga dropdown, scrollbar, dan kontrol bawaan browser ikut gelap.

Tidak ada filter `invert`: versi awal memakainya dan itu membuat sebagian bagian (mis. form edit di tab **Semua Parameter**, label tag, notifikasi) tidak terbaca.

Halaman Bot / Bot WA / Peta / ODP berjalan di iframe dan membaca variabel `--acs-*` dari halaman induk, jadi warnanya ikut tema dan berubah langsung saat tema diganti.

## Grafik Overview

Warna irisan diambil dari Config (`ui.overview.charts.*.color`). Di tema berwarna/gelap, warna dingin (biru/hijau/ungu) diganti palet tema; **merah/oranye/kuning dibiarkan** karena bermakna (off, kritis, peringatan). Tema Terang dan Gelap memakai warna asli dari Config.

## Menambah tema

Edit array `T` di `scripts/lib/theme-runtime.js`: `id`, `n` (nama), `dark`, `bg`, `sf` (permukaan), `hd` (header), `mu` (teks redup), `c` (`--color1..5`), `cp` (palet grafik atau `null`). Lalu pasang ulang: `bash scripts/ui-admin-menu.sh --all`.
