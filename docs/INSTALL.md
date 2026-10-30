# Panduan Instal

> Panduan ini untuk server yang **GenieACS-nya sudah jalan**. Kalau belum ada GenieACS sama sekali, mulai dari [GENIEACS-FRESH-INSTALL.md](GENIEACS-FRESH-INSTALL.md) dulu.

## 1. Prasyarat

| Komponen | Cek |
|---|---|
| GenieACS 1.2.x sudah jalan (cwmp, nbi, fs, ui) | `systemctl status genieacs-ui` |
| MongoDB shell: `mongo` atau `mongosh` | `mongo --version` / `mongosh --version` |
| MongoDB Database Tools (`mongodump`, `mongorestore`) | `mongodump --version` |
| Node.js (sudah ada karena GenieACS butuh Node) | `node -v` |
| `curl`, `git` | |

Jalankan installer sebagai user yang bisa mengakses MongoDB tanpa password. Ini kondisi default instalasi GenieACS: MongoDB di `127.0.0.1:27017`, database `genieacs`. Untuk installer **tidak perlu sudo**.

### GenieACS baru pertama kali dipasang (belum ada user)?

GenieACS sendiri tidak membuat user admin pertama secara otomatis — login akan selalu gagal sampai ada baris di koleksi `users`. Dan sekadar punya user saja **belum cukup**: tanpa baris di koleksi `permissions`, user tetap bisa login tapi setiap halaman menampilkan *"You are not authorized to view this page"*. Buat keduanya sekaligus:

```bash
bash scripts/create-admin.sh admin 'PasswordKuatAnda'
```

Aman dijalankan berkali-kali (upsert), termasuk untuk reset password user yang sudah ada atau menambah admin kedua. Lihat isi script untuk detail algoritma hash (cocok dengan GenieACS 1.2.13; cek ulang bila versi Anda jauh berbeda).

Kalau nama database bukan `genieacs`, atau UI tidak di port 3000:
```bash
export GENIEACS_DB=namadb
export UI_URL=http://127.0.0.1:3000/
```

## 2. Ambil repo

```bash
git clone https://github.com/s4lfanet/Genieacs-Multitab.git
cd Genieacs-Multitab
```

## 3. Lihat rencana (dry-run)

```bash
bash scripts/install.sh --dry-run
```
Dry-run hanya menampilkan apa yang akan dipasang, tanpa menulis apa pun.

## 4. Instal

```bash
bash scripts/install.sh
```

Urutan kerja installer:
1. Memastikan UI menjawab HTTP 200 sebelum mulai.
2. **Backup** koleksi `config`, `virtualParameters`, `provisions`, `presets` ke `backups/<waktu>/`.
3. Memasang 29 Virtual Parameter, provision `bootstrap` dan `default`, serta preset `bootstrap`/`default`. **Yang sudah ada di server dan isinya berbeda tidak ditimpa** (dilaporkan sebagai "dilewati"); pakai `--overwrite` kalau memang mau menggantinya. Provision yang mengubah ONT (`inform2`, `useradmin2`, `remoteweb`, `nokia_pppoe`) **tidak ikut terpasang** kecuali diminta dengan flag `--preset-*` / `--provision=`.
4. **Mengganti semua key `ui.*`** di Config dengan tampilan multi-tab. Key `branding.*` hanya ditambahkan kalau belum ada.
5. Membersihkan cache GenieACS.
6. Mengecek UI 6 kali. Kalau UI tidak menjawab 200, installer **rollback otomatis** dari backup tadi.

Buka GenieACS di browser, tekan **Ctrl+F5**, lalu buka sebuah device. Bar tab akan tampil di bawah nama device.

> Langkah 4 menimpa tampilan UI yang sudah ada, termasuk kustomisasi Anda sendiri di `ui.*`. Semuanya tersimpan di folder backup.

### Data belum muncul?
VP diisi oleh provision `default`, yang di-refresh tiap jam atau tiap ONT inform. Supaya langsung terisi, klik **Summon** di halaman device, atau tunggu siklus inform berikutnya.

## 5. Opsi installer

| Opsi | Fungsi |
|---|---|
| `--dry-run` | hanya tampilkan rencana |
| `--no-ui` / `--no-vp` / `--no-provisions` | lewati bagian tertentu |
| `--bot-config` | tambah key contoh `bot.*` ke Config |
| `--provision=NAME` | pasang provision yang mengubah ONT tanpa presetnya (mis. `--provision=nokia_pppoe`); nilai `GANTI_` ditolak |
| `--overwrite` | timpa VP/provision/preset yang sudah ada **dan berbeda** (default: dilewati). Backup tetap dibuat |
| `--preset-connreq` | preset `connreq` → provision `connreq` (**mengubah ONT**, tetapi hanya user/password connection request supaya Summon berfungsi; tanpa nilai `GANTI_`, tidak menyentuh URL/kredensial ACS). Lihat TROUBLESHOOTING |
| `--preset-inform` | preset `inform` → provision `inform2` (**mengubah ONT**: URL ACS, user/pass ACS, connection request, interval inform) |
| `--preset-useradmin` | preset `useradmin` → `useradmin2` (**mengubah ONT**: user/password web ONT dipaksa setiap inform) |
| `--preset-remoteweb` | preset `remoteweb` → `remoteweb` (**mengubah ONT**: buka web dari WAN, firewall ONT dilonggarkan) |
| `--force` | tetap jalan walau UI belum 200 sebelum instal (rollback otomatis jadi tidak bisa dinilai) |

### Memasang preset yang mengubah ONT
1. Edit file provision-nya dan ganti semua nilai `GANTI_...`:
   - `provisions/inform2.js`: `url` (alamat CWMP server Anda, mis. `http://10.0.0.1:7547`), `AcsUser`, `AcsPass`
   - `provisions/useradmin2.js`: user & password web ONT (untuk Nokia wajib kompleks, mis. `Abcd@1234`)
2. Pasang ulang dengan flag-nya, misalnya `bash scripts/install.sh --preset-useradmin`.
3. Uji dulu di 1–2 ONT. Caranya: ubah *precondition* preset di Admin → Presets menjadi `DeviceID.ID = "..."`. Pastikan **Last Inform** masih bertambah setelah 2 siklus inform, baru buka untuk semua ONT.

Installer **menolak** memasang provision yang mengubah ONT selama masih ada `GANTI_` di dalamnya.

> **Server yang sudah berjalan:** kalau server Anda sudah punya `inform2`/`useradmin2`/`remoteweb` dengan nilai sendiri, installer tidak menyentuhnya. Jangan pakai `--overwrite` bersama `--preset-*` kecuali file di repo sudah Anda isi dengan nilai yang benar, karena provision di server akan diganti dan langsung dijalankan ke semua ONT.

⚠️ URL ACS yang salah di `inform2` membuat ONT berhenti inform, dan setelah itu tidak bisa dikembalikan dari GenieACS. Perbaikannya harus lewat web lokal ONT atau OLT.

## 6. Fitur tambahan

- Branding (logo/judul): [BRANDING.md](BRANDING.md), cukup `bash scripts/setup-branding.sh`
- Bot Telegram: [TELEGRAM-BOT.md](TELEGRAM-BOT.md), cukup `bash scripts/setup-bot.sh`

## 7. Uninstall / kembali ke sebelumnya

```bash
bash scripts/restore.sh backups/<waktu>
```
Koleksi config, VP, provisions, dan presets dikembalikan persis seperti sebelum instal. Koleksi yang belum ada saat backup akan dikosongkan.

## 8. Update

```bash
git pull
bash scripts/install.sh      # backup baru dibuat otomatis
```
Key `branding.*` dan `bot.*` yang sudah Anda isi tidak ditimpa.
