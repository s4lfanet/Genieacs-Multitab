# Troubleshooting & Pelajaran dari Produksi

## UI GenieACS HTTP 500 / halaman putih setelah edit Config
Penyebab: ada nilai `ui.*` yang tidak bisa diparse sebagai ekspresi. Contohnya teks berisi kutip tunggal atau backslash, atau kutip yang tidak ditutup. Akibatnya worker UI crash dan semua user kena.
- Cek log: `journalctl -u genieacs-ui -n 50` (cari `PARSING FAILED`)
- Pulihkan: `bash scripts/restore.sh backups/<waktu-terakhir>`

## Tulisan "Error!" di halaman device
Ada komponen `container` tanpa `components`. Untuk elemen kosong seperti `input`, tambahkan `components.0.type = ''`. Klik tulisan "Error!" untuk melihat stack trace di console browser.

## Tab tidak muncul / semua isi tampil sekaligus
- Browser terlalu lama dan belum mendukung CSS `:has()`. Perbarui Chrome/Edge/Firefox.
- Tekan Ctrl+F5 untuk membuang cache.

## Nilai VP kosong
- Provision `default` belum jalan untuk device itu. Klik **Summon**, atau tunggu inform berikutnya.
- Merk tersebut belum didukung VP-nya. Lihat parameter aslinya di tab **Semua Parameter**, lalu tambahkan path-nya ke VP.

## `too_many_commits` massal
Penyebab: provision yang dijalankan **setiap inform** berisi loop dinamis (discover objek, AddObject/DeleteObject berdasarkan isi tabel). Nilainya berubah setiap evaluasi, sehingga sesi tidak pernah stabil. Pernah terjadi ±316 ONT kena fault sekaligus.
- Jangan taruh perbaikan dinamis (mis. tabel ACL) di provision per-inform. Pakai skrip sekali jalan lewat NBI dalam batch kecil, seperti `tools/fix-huawei-acl.sh`.
- Hindari nilai acak di provision, misalnya password connection request. `inform2` memakai password deterministik dari ID device.
- Rollback cepat: kembalikan provision dari backup, lalu hapus fault `too_many_commits` di menu Faults.

## Satu SPV gagal, banyak channel ikut fault
GenieACS menggabungkan SetParameterValues dari beberapa provision. Kalau satu nilai ditolak ONT (mis. 9007 karena password Nokia terlalu sederhana), semua channel di batch itu ikut fault. Cari parameter penyebabnya di detail fault.

## ONT berhenti inform setelah mengubah WAN / URL ACS
- Menambah WAN baru dengan service TR069 tanpa VLAN yang benar di OLT akan memutus jalur ACS ONT tersebut.
- URL ACS yang salah juga memutus ONT. Perbaikannya hanya lewat web lokal ONT atau OLT.
- Untuk setiap perubahan, uji dulu di 1 ONT dan pantau **Last Inform** selama ≥ 2 siklus inform.

## Setelah mengubah provision/VP lewat NBI, hasilnya belum berubah
Proses cwmp memakai cache lokal selama beberapa detik. Tunggu sebentar, lalu uji lagi.

## Setelah instal di server yang sudah berjalan: connection request 403, ONT berhenti inform
Gejala: halaman device menampilkan "Connection request error: Unexpected status code 403", Summon gagal, atau ONT hilang dari daftar online.

Penyebab (installer versi lama): semua provision di repo ditimpa ke server, termasuk `inform2` / `useradmin2` yang di repo berisi nilai contoh `GANTI_...`. Kalau server sudah punya preset `inform` (atau `useradmin`) yang memakai provision itu, template tersebut langsung dijalankan ke SEMUA ONT: URL ACS, user/password ACS, dan connection request user/password ONT diganti nilai palsu, dan password web ONT juga.

Pemulihan, secepat mungkin (setiap inform ONT yang menerima nilai palsu memperburuk keadaan):
1. Restore backup yang dibuat installer: `bash scripts/restore.sh backups/<waktu>` (provision/preset/VP/config kembali seperti sebelum instal). Folder backup ada di `backups/`.
2. Cek di Admin → Provisions bahwa `inform2`/`useradmin2` berisi nilai yang benar, dan Admin → Presets bahwa presetnya sesuai.
3. ONT yang sudah sempat inform dengan URL ACS palsu (`GANTI_IP_ACS`) tidak bisa dijangkau lagi dari GenieACS; perbaikannya lewat web lokal ONT atau OLT. ONT yang hanya kena kredensial connection request biasanya pulih setelah inform berikutnya dengan nilai yang benar.
4. Pakai installer versi terbaru: tidak lagi menimpa provision/preset yang sudah ada dan tidak memasang provision pengubah ONT tanpa diminta. Jalankan `bash scripts/install.sh --dry-run` dulu dan baca bagian "DILEWATI".

## Summon / connection request gagal
- Connection request user/pass di ONT berbeda dengan data di GenieACS. Biasanya pulih setelah inform berikutnya.
- IP TR-069 ONT tidak bisa dijangkau dari server (NAT/VLAN). Cek dengan `ping` dari server.

## Branding tidak berubah
`tail ~/genieacs-branding/log.txt`. Penyebab umum:
- Nama file di Files berbeda dengan `branding.logo`
- Format gambar tidak dikenal
- Izin tulis hilang setelah GenieACS di-update. Jalankan lagi `scripts/setup-branding.sh`.
