# Peta Pelanggan & ODP (opsional)

Halaman peta berdiri sendiri (Leaflet) untuk menandai lokasi ONT dan ODP. Tidak mengubah GenieACS, MongoDB, atau ONT.

## Cara kerja

- `map/map.js`: server Node tanpa npm (Node 12+). Membaca daftar ONT dari NBI (**hanya GET**: PPPoE user, SN, redaman, status online).
- Lokasi ONT dan ODP disimpan di `~/genieacs-map/data/locations.json` (bukan di MongoDB GenieACS). Ikut backup folder itu.
- Penanda ONT: hijau = online & redaman baik, kuning = redaman < -27 dBm, merah = offline, abu = redaman belum ada. Kotak biru = ODP; garis putus-putus = ONT ke ODP-nya.

## Keamanan

- Semua route wajib login (HTTP Basic, password di-hash scrypt, 5 salah = diblok 1 menit per IP).
- Default hanya listen di `127.0.0.1`. Akses dari PC lewat SSH tunnel, atau lewat reverse proxy HTTPS (nginx) milik Anda. Basic auth lewat HTTP polos bisa disadap, jadi jangan buka `host` ke `0.0.0.0` tanpa HTTPS.
- Tulis hanya ke file lokasi sendiri; tidak ada route yang mengirim perintah ke ONT. Request tulis ditolak bila Origin asing atau bukan `application/json`.
- Browser memuat Leaflet dari unpkg (dikunci SRI) dan tile dari OpenStreetMap/Esri, jadi perlu internet di sisi browser.

## Pasang

```bash
bash scripts/setup-map.sh      # catat password yang tampil sekali
ssh -L 7570:127.0.0.1:7570 user@server
# buka http://127.0.0.1:7570/  (user: admin)
```

Ubah port/host/NBI di `~/genieacs-map/config.json`, lalu `sudo systemctl restart genieacs-map`. Lupa password: hapus `config.json`, jalankan `setup-map.sh` lagi (data lokasi tetap).

## Pakai

1. Tab **ODP** → "+ ODP baru" → isi ID, nama, kapasitas → "Tandai di peta".
2. Tab **ONT** → pilih pelanggan (yang belum dipetakan tampil di atas) → isi nama/ODP → "Tandai di peta".
