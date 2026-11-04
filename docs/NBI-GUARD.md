# Akses NBI: atur IP yang boleh menjangkau NBI dari menu Admin

NBI GenieACS (port **7557**) **tidak punya login**, dan `GET /users` membocorkan hash sandi akun UI ([ANDROID-APP.md](ANDROID-APP.md), bagian Keamanan). Karena itu `scripts/nbi-firewall.sh` hanya mengizinkan localhost dan jaringan server sendiri. Halaman **Admin → Akses NBI** membuat daftar IP yang boleh menjangkau NBI bisa diatur dari browser, tanpa terminal.

## Kapan dipakai

Aplikasi Android (Alijaya) atau alat luar yang mengakses NBI lewat port-forward di router, mis. `103.191.165.119:798` → `192.168.54.254:7557`. Server melihat **alamat asli pengirim**, jadi pengirimnya harus didaftarkan di sini. Kalau tidak, sambungan ditolak (aplikasi gagal terhubung).

> Port di router (798) dan port di server (7557) boleh berbeda. Halaman ini membatasi port **di server**. Yang diisi sebagai IP adalah alamat pengguna (HP/PC), bukan alamat router.

## Cara pakai

1. Buka **Admin → Akses NBI**.
2. Bagian **Sedang ditolak (24 jam terakhir)** menampilkan IP yang baru saja ditolak. Kalau aplikasi Anda gagal terhubung, IP-nya ada di sana. Klik **Izinkan** pada IP yang Anda kenal.
3. Atau **+ Tambah IP** manual: satu IP (`114.122.75.181`) atau satu jaringan (`10.8.0.0/24`), plus keterangan.
4. **Simpan & terapkan**. Hasilnya (✓/✕) muncul dalam beberapa detik.

Localhost dan jaringan server sendiri **selalu** diizinkan, jadi bot Telegram/WhatsApp, installer, dan halaman Admin tidak pernah terpengaruh.

## Yang dijaga

| Risiko | Penanganan |
|---|---|
| Membuka NBI untuk seluruh internet tanpa sengaja | Blok lebih lebar dari `/16` (termasuk `0.0.0.0/0`) **ditolak**; mematikan pembatasan meminta konfirmasi |
| Membatasi port yang salah dan memutus ONT/UI/SSH | Port 22, 80, 443, 3000 (UI), 3010, 3020, **7547 (CWMP)**, 7567, 27017 tidak bisa dipilih |
| Input berbahaya (injeksi perintah/opsi iptables) | Layanan memvalidasi ketat (hanya IPv4 dan prefix 16-32), lalu memanggil firewall dengan argumen, **tanpa shell** |
| Pengaturan rusak | Ditolak seluruhnya; aturan yang sedang jalan tidak berubah; alasan tampil di halaman |
| Aturan hilang (reboot, flush manual) | Layanan memasang ulang otomatis (cek tiap 30 detik) |
| Firewall gagal diuji | `nbi-firewall.sh` menguji localhost dan IP server sendiri setelah menerapkan; bila gagal, aturan dicabut otomatis |

Hanya akun yang boleh mengubah Config (admin) yang bisa membuka halaman dan menyimpan perubahan.

## Pasang (sekali, di server)

```
bash scripts/setup-nbi-guard.sh                    # layanan genieacs-nbi-guard (root); butuh sudo
bash scripts/ui-admin-menu.sh --all --portal --nbi # menu Admin -> Akses NBI (updater memasangnya otomatis bila layanan terpasang)
```

Aman untuk server yang sudah memakai `nbi-firewall.sh`: saat pertama jalan, layanan **membaca firewall yang ada** dan mengimpornya ke halaman tanpa mengubah apa pun. Setelah repo diperbarui, jalankan `setup-nbi-guard.sh` lagi untuk memperbarui layanan.

Copot layanan: `bash scripts/setup-nbi-guard.sh --remove` (firewall yang aktif dibiarkan).

## Hal lain yang perlu dicek bila aplikasi Android (Alijaya) masih gagal

- Aplikasi **memaksa port 3000** pada host yang sama untuk langkah login (`POST http://host:3000/login`), bukan port web yang Anda pakai. Pastikan `host:3000` ikut diteruskan ke UI GenieACS.
- Akses dari internet ke NBI tetap berisiko walau dibatasi per IP (IP seluler berganti). Alternatif lebih aman: VPN ke jaringan server dan daftarkan alamat VPN-nya di sini.

## Uji

`node tools/test-nbi-guard.js` (42 pemeriksaan: validasi IP/port, injeksi, parser log, perbandingan subnet). Integrasi pada server (iptables sungguhan di port uji, database sandbox, port 7557 tidak disentuh): lihat riwayat commit.
