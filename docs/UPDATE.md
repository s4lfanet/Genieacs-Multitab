# Update dari sidebar Admin

Halaman **Admin → Update** (dan **Admin → Status**, lihat bagian bawah) memeriksa dan memasang pembaruan Genieacs-Multitab dari GitHub tanpa SSH: lihat versi terpasang dan terbaru, daftar perubahan, pasang dengan satu klik, dan kembalikan versi sebelumnya kalau perlu.

## Pasang (sekali, di server)

```bash
bash scripts/setup-updater.sh        # layanan updater (butuh sudo)
bash scripts/ui-admin-menu.sh --all  # menu Update di sidebar (ikut memasang menu lain)
```

Lalu Ctrl+F5 dan buka Admin → Update. Opsi `setup-updater.sh`: `--branch`, `--repo`, `--bot-dir`, `--uipatch-dir`, `--remove`.

## Cara kerja

Halaman hanya berjalan di browser, jadi ia tidak bisa menjalankan perintah di server. Ia berbicara dengan layanan `genieacs-multitab-updater` lewat dua key Config (sama seperti QR bot WA): `update.request` (permintaan dari halaman) dan `update.status` (versi, daftar perubahan, log). Detak jantung layanan dibaca dari file status (lihat bagian Status layanan).

- **Periksa:** `git fetch` lalu bandingkan dengan `origin/main`. Otomatis juga tiap 6 jam.
- **Pasang:** snapshot file yang akan diubah → `git merge --ff-only origin/main` → `scripts/ui-admin-menu.sh` dengan komponen yang sudah terpasang → cek UI menjawab 200. Gagal di langkah mana pun: snapshot dikembalikan otomatis.
- **Kembalikan versi sebelumnya:** memulihkan snapshot update terakhir dan `git reset --hard` ke versi sebelumnya.
- **Bot WA (opsional):** centang di halaman untuk ikut menyalin `wa.js`, `core.js`, `wa-page.html` dan me-restart `genieacs-wa-bot`. Kalau `package.json` bot berubah, update bot ditolak dan Anda diminta menjalankan `scripts/setup-wa-bot.sh` manual.

## Model keamanan

Layanan ini berjalan sebagai **root**, jadi batasannya sengaja ketat:

- Halaman **tidak bisa mengirim perintah**. Permintaan hanya `check`, `apply`, `rollback` dengan komponen `ui`/`wa`; yang lain ditolak. Tidak ada nilai dari Config yang masuk ke shell.
- Alamat repo, branch, dan semua path ada di `/etc/genieacs-multitab/updater.conf` (milik root), bukan dari browser.
- Checkout `/opt/genieacs-multitab` milik root dan hanya di-`fast-forward`; perubahan manual di dalamnya membuat update ditolak.
- Yang disentuh hanya tampilan (`public/app-*.js` dan halaman html) dan, bila dipilih, file bot WA. **Provision, preset, Config `ui.*`, ONT, dan program GenieACS tidak disentuh.**
- Permintaan yang sudah ada saat layanan start dianggap sudah ditangani (tidak dijalankan ulang).

Yang perlu diterima: siapa pun yang punya izin menulis Config di GenieACS (admin) bisa memicu update, dan isi update adalah isi branch `main` di repo yang diset. Artinya **akses push ke repo itu setara akses root di server**. Gunakan repo milik Anda sendiri dan amankan akun GitHub-nya (2FA). Kalau tidak mau risiko itu, jangan pasang layanan ini dan update lewat `git pull` + `bash scripts/ui-admin-menu.sh --all` secara manual.

## Halaman Status layanan

Halaman **Admin → Sistem → Status** menampilkan kondisi **UI (3000), CWMP (7547), NBI (7557), dan FS (7567)**: berjalan/mati/tidak merespons, respons HTTP dan latensi, lama berjalan, memori, PID, dan jumlah restart. Di bawahnya layanan pendukung (MongoDB, bot Telegram, bot WA, updater) dan kondisi server (RAM, disk, beban, jumlah ONT online, fault).

Browser hanya bisa menjangkau port UI, dan status systemd tidak bisa dibaca dari browser, jadi datanya dikumpulkan oleh layanan updater yang sama (`systemctl show` + probe HTTP lokal ke tiap port) lalu ditulis ke **file statis** bernama acak di folder `public` GenieACS (`sys-<acak>.json`, nama dicatat sekali di Config `sys.file`), diperbarui tiap ±20 detik. Sengaja **bukan** key Config: UI GenieACS menampilkan banner *"Configuration has been modified, please reload the page"* setiap isi Config berubah, jadi menulis status berkala ke Config membuat banner itu muncul terus. Sekarang Config hanya ditulis saat Anda menekan tombol (periksa/pasang/rollback). Halaman ini hanya **membaca** dan tidak punya tombol restart.

Kriteria: **Berjalan** = unit `active` dan probe menjawab (UI/NBI harus HTTP 200; CWMP/FS cukup menjawab HTTP apa pun karena menolak GET dengan 405/404). **Tidak merespons** = unit aktif tetapi probe gagal. **Mati/Gagal** = unit tidak aktif. Port bisa diubah lewat `ports` di `updater.conf`.

## Hapus

```bash
bash scripts/setup-updater.sh --remove
```

## Masalah umum

- **"Layanan updater belum aktif"**: `systemctl status genieacs-multitab-updater` dan `journalctl -u genieacs-multitab-updater -n 50`.
- **Update ditolak: "Checkout lokal memiliki perubahan manual"**: `sudo git -C /opt/genieacs-multitab status`, lalu `sudo git -C /opt/genieacs-multitab checkout -- .`.
- **Setelah update tampilan tidak berubah**: Ctrl+F5. GenieACS yang di-upgrade menghapus patch tampilan; jalankan Update lagi atau `bash scripts/ui-admin-menu.sh --all`.
